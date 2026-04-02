#!/usr/bin/env bun
/**
 * x402 Payment Payload Generator — Solana (SVM) バージョン
 *
 * 【generate モード（デフォルト）】
 *   署名済み支払いペイロードを生成して出力するだけ（実際にはオンチェーン決済しない）。
 *   出力値を test.http の @paymentPayload に貼り付けて手動テストに使用。
 *
 * 【pay モード（--pay）】
 *   402 取得 → 署名 → 再送 → オリジンから 200 レスポンスを取得する完全なフローを実行。
 *   実際に USDC が消費される。
 *
 * 使い方:
 *   bun run generate-payment-solana.ts                        # /api/hello のペイロード生成
 *   bun run generate-payment-solana.ts /api/premium/data      # 別エンドポイントのペイロード生成
 *   bun run generate-payment-solana.ts --pay                  # /api/hello を実際に支払い
 *   bun run generate-payment-solana.ts /api/hello --pay       # 上と同じ（明示的にエンドポイント指定）
 *
 * または package.json scripts から:
 *   bun run generate:sol          # /api/hello ペイロード生成（Solana）
 *   bun run generate:sol:premium  # /api/premium/data ペイロード生成（Solana）
 *   bun run pay:sol               # /api/hello フル支払い（Solana）
 */

import events from "node:events";
import { x402Client } from "@x402/core/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Bun 互換パッチ: @solana/rpc が AbortSignal 付きで setMaxListeners を呼ぶが
// Bun の node:events 実装は EventTarget/AbortSignal を引数に未対応のためエラーになる。
// 呼び出しを try/catch で包んで Bun 上でも安全に動作させる。
{
  const orig = events.setMaxListeners.bind(events);
  // @ts-ignore
  events.setMaxListeners = (n: number, ...emitters: unknown[]) => {
    try {
      orig(n, ...emitters);
    } catch {
      // Bun では AbortSignal を渡すと失敗するので無視する
    }
  };
}

// スクリプトと同じディレクトリの .env を読み込む
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

// ── 定数 ──────────────────────────────────────────────────────────────────────
// Solana Devnet の USDC Mint アドレス
const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
const LINE = "─".repeat(60);
const LINE_DOUBLE = "═".repeat(60);

// ── 環境変数チェック ───────────────────────────────────────────────────────────
const svmPrivateKey = process.env.SVM_PRIVATE_KEY;
if (!svmPrivateKey || svmPrivateKey === "YOUR_SOLANA_PRIVATE_KEY_BASE58") {
  console.error("エラー: SVM_PRIVATE_KEY が scripts/.env に設定されていません。");
  console.error("  Solana ウォレットの秘密鍵を base58 形式で設定してください。");
  console.error("  例: SVM_PRIVATE_KEY=5Kb8kLf9zgWQnogid...");
  process.exit(1);
}

const cloudfrontUrl = process.env.CLOUDFRONT_URL;
if (!cloudfrontUrl || cloudfrontUrl.includes("XXXXX")) {
  console.error("エラー: CLOUDFRONT_URL が scripts/.env に設定されていません。");
  console.error("  cdk deploy 後に出力される CloudFrontUrl の値を設定してください。");
  process.exit(1);
}

// ── CLI 引数パース ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const endpoint = args.find((a) => a.startsWith("/")) ?? "/api/hello";
const isFullPay = args.includes("--pay");
const targetUrl = `${cloudfrontUrl}${endpoint}`;

// ── Solana キーペア初期化 ──────────────────────────────────────────────────────
// base58 形式の秘密鍵をバイト列にデコードして KeyPairSigner を作成
const keyBytes = base58.decode(svmPrivateKey);
const signer = await createKeyPairSignerFromBytes(keyBytes);

// ── x402 クライアント初期化 ────────────────────────────────────────────────────
const x402 = new x402Client();
// SVM 署名スキームを登録（全ての Solana ネットワークに対応）
x402.register("solana:*", new ExactSvmScheme(signer));

// ── ヘルパー関数 ──────────────────────────────────────────────────────────────

/**
 * Solana Devnet の USDC 残高を取得するメソッド
 * Solana JSON RPC の getTokenAccountsByOwner を使用
 */
async function getUsdcBalance(): Promise<number | null> {
  try {
    const response = await fetch(SOLANA_DEVNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          signer.address,
          { mint: USDC_DEVNET_MINT },
          { encoding: "jsonParsed" },
        ],
      }),
    });
    const json = (await response.json()) as {
      result?: {
        value?: Array<{
          account: {
            data: {
              parsed: {
                info: {
                  tokenAmount: { uiAmount: number | null };
                };
              };
            };
          };
        }>;
      };
    };
    const accounts = json.result?.value ?? [];
    if (accounts.length === 0) return 0;
    return accounts[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0;
  } catch {
    return null;
  }
}

/**
 * X-PAYMENT-REQUIRED ヘッダーを base64 デコードして表示するメソッド
 */
function printPaymentRequirements(header: string): void {
  try {
    const requirements = JSON.parse(
      Buffer.from(header, "base64").toString("utf-8"),
    );
    const accept = requirements?.accepts?.[0];
    if (!accept) return;

    const rawAmount = accept.maxAmountRequired ?? accept.amount ?? 0;
    const usdcAmount = (Number(rawAmount) / 1_000_000).toFixed(6);

    console.log("  Network :  " + (accept.network ?? "-"));
    console.log("  Price   :  $" + usdcAmount + " USDC");
    console.log("  Pay To  :  " + (accept.payTo ?? "-"));
    console.log("  Asset   :  " + (accept.asset ?? "-"));
  } catch {
    console.log("  (ヘッダーのデコードに失敗しました)");
  }
}

/**
 * ── Step 1: 402 レスポンスを確認 ──────────────────────────────────────────────
 */
async function step1_showPaymentRequired(): Promise<boolean> {
  console.log("\n" + LINE);
  console.log("Step 1: 支払いなしでリクエスト → 402 Payment Required");
  console.log(LINE);
  console.log("URL: " + targetUrl + "\n");

  const res = await fetch(targetUrl);
  console.log("Status: " + res.status + " " + res.statusText);

  if (res.status !== 402) {
    console.log(
      "⚠️  402 以外のステータスが返りました（無料エンドポイントではありませんか？）",
    );
    return false;
  }

  const paymentHeader =
    res.headers.get("payment-required") ??
    res.headers.get("x-payment-required");
  if (paymentHeader) {
    console.log("\nPayment Requirements:");
    printPaymentRequirements(paymentHeader);
  } else {
    console.log("⚠️  X-PAYMENT-REQUIRED ヘッダーが見つかりませんでした。");
  }

  return true;
}

/**
 * ── モード A: ペイロード生成のみ（決済なし）────────────────────────────────────
 */
async function generatePayloadOnly(): Promise<void> {
  const has402 = await step1_showPaymentRequired();
  if (!has402) process.exit(1);

  console.log("\n" + LINE);
  console.log("Step 2: 支払いペイロードを署名生成（オンチェーン決済はしない）");
  console.log(LINE);
  console.log("Wallet: " + signer.address);

  const balance = await getUsdcBalance();
  if (balance !== null) {
    console.log("Balance: " + balance.toFixed(6) + " USDC (Solana Devnet)");
    if (balance < 0.001) {
      console.log(
        "⚠️  USDC 残高が少ないです。https://faucet.circle.com/ で補充してください。",
      );
    }
  } else {
    console.log("⚠️  残高確認に失敗しました（ネットワークエラー）");
  }

  console.log("\n署名中...");

  let capturedSignature: string | null = null;

  /**
   * fetch をインターセプト:
   *   - 1回目（Payment-Signature なし）: 通常通り送信 → 402 を取得
   *   - 2回目（Payment-Signature あり）: シグネチャを記録してモック 200 を返す
   *     → 実際の再送（決済）は行わない
   */
  const interceptFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // @x402/fetch は 2 回目の fetch を Request オブジェクトとして渡すため
    // init.headers ではなく Request.headers から取得する必要がある
    let sig: string | null = null;
    if (input instanceof Request) {
      sig =
        input.headers.get("PAYMENT-SIGNATURE") ??
        input.headers.get("X-PAYMENT");
    } else {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sig =
        headers["PAYMENT-SIGNATURE"] ??
        headers["X-PAYMENT"] ??
        null;
    }

    if (sig) {
      capturedSignature = sig;
      return new Response(
        JSON.stringify({ captured: true, message: "Payload captured" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return fetch(input, init);
  };

  const fetchWithPayment = wrapFetchWithPayment(
    interceptFetch as typeof fetch,
    x402,
  );

  await fetchWithPayment(targetUrl);

  if (!capturedSignature) {
    console.error("\n支払いシグネチャの生成に失敗しました。");
    console.error(
      "サーバーが Solana ネットワーク (solana:EtWTRA...) を受け付けているか確認してください。",
    );
    process.exit(1);
  }

  console.log("\n" + LINE_DOUBLE);
  console.log(
    "生成された Payment-Signature (test.http の @paymentPayload に貼り付け):",
  );
  console.log(LINE_DOUBLE);
  console.log(capturedSignature);
  console.log(LINE_DOUBLE);
  console.log(
    "\n注意: このシグネチャはリプレイ保護により 1 回限り有効です。",
  );
}

/**
 * ── モード B: フル支払い（実際に USDC を消費）────────────────────────────────
 */
async function fullPayment(): Promise<void> {
  const has402 = await step1_showPaymentRequired();
  if (!has402) process.exit(1);

  console.log("\n" + LINE);
  console.log("Step 2 + 3: 支払い → オリジンからレスポンス取得");
  console.log(LINE);
  console.log("Wallet: " + signer.address);

  const balanceBefore = await getUsdcBalance();
  if (balanceBefore !== null) {
    console.log(
      "Balance (before): " + balanceBefore.toFixed(6) + " USDC (Solana Devnet)",
    );
  }

  console.log("\n支払い中...");

  const fetchWithPayment = wrapFetchWithPayment(fetch, x402);
  const response = await fetchWithPayment(targetUrl);

  console.log("\nStatus: " + response.status + " " + response.statusText);
  const bodyText = await response.text();
  try {
    console.log("Response:", JSON.stringify(JSON.parse(bodyText), null, 2));
  } catch {
    console.log("Response:", bodyText);
  }

  const balanceAfter = await getUsdcBalance();
  if (balanceAfter !== null) {
    console.log(
      "\nBalance (after): " + balanceAfter.toFixed(6) + " USDC (Solana Devnet)",
    );
    if (balanceBefore !== null) {
      const spent = balanceBefore - balanceAfter;
      if (spent > 0) {
        console.log("Spent: $" + spent.toFixed(6) + " USDC");
      }
    }
  }

  console.log("\n" + LINE_DOUBLE);
  console.log("支払い完了!");
  console.log(LINE_DOUBLE);
}

// ── エントリーポイント ─────────────────────────────────────────────────────────
console.log("x402 Payment Script — Solana (SVM)");
console.log(
  "Mode:     " +
    (isFullPay
      ? "フル支払い (--pay) ※ 実際に USDC を消費します"
      : "ペイロード生成のみ (デフォルト)"),
);
console.log("Endpoint: " + endpoint);
console.log("Network:  Solana Devnet (solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1)");

if (isFullPay) {
  await fullPayment();
} else {
  await generatePayloadOnly();
}
