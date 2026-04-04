#!/usr/bin/env bun
/**
 * x402 Payment Payload Generator
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
 *   bun run generate-payment.ts                        # /api/hello のペイロード生成
 *   bun run generate-payment.ts /api/premium/data      # 別エンドポイントのペイロード生成
 *   bun run generate-payment.ts /content/article       # /content/* のペイロード生成
 *   bun run generate-payment.ts --pay                  # /api/hello を実際に支払い
 *   bun run generate-payment.ts /api/hello --pay       # 上と同じ（明示的にエンドポイント指定）
 *
 * または package.json scripts から:
 *   bun run generate          # /api/hello ペイロード生成
 *   bun run generate:premium  # /api/premium/data ペイロード生成
 *   bun run pay               # /api/hello フル支払い
 */

import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, erc20Abi, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// スクリプトと同じディレクトリの .env を読み込む
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

// ── 定数 ──────────────────────────────────────────────────────────────────────
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const LINE = "─".repeat(60);
const LINE_DOUBLE = "═".repeat(60);

// ── 環境変数チェック ───────────────────────────────────────────────────────────
const privateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey || privateKey === "0x_YOUR_PRIVATE_KEY_HERE") {
  console.error("エラー: EVM_PRIVATE_KEY が scripts/.env に設定されていません。");
  console.error("  cp scripts/.env.example scripts/.env  でファイルを作成してください。");
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

// ── x402 クライアント初期化 ────────────────────────────────────────────────────
const signer = privateKeyToAccount(privateKey);
const x402 = new x402Client();
// EVM 署名スキームを登録（全ての eip155 ネットワークに対応）
x402.register("eip155:*", new ExactEvmScheme(signer));

// ── ヘルパー関数 ──────────────────────────────────────────────────────────────

/**
 * Base Sepolia の USDC 残高を取得するメソッド
 */
async function getUsdcBalance(): Promise<number | null> {
  try {
    // パブリッククライアント
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });
    // 残高取得
    const balance = await publicClient.readContract({
      address: USDC_BASE_SEPOLIA,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [signer.address],
    });
    return Number(balance) / 1_000_000;
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

    // amount フィールド名は x402 バージョンにより異なる場合がある
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
 * @returns 
 */
async function step1_showPaymentRequired(): Promise<boolean> {
  console.log("\n" + LINE);
  console.log("Step 1: 支払いなしでリクエスト → 402 Payment Required");
  console.log(LINE);
  console.log("URL: " + targetUrl + "\n");
  // APIを呼び出す
  const res = await fetch(targetUrl);
  console.log("Status: " + res.status + " " + res.statusText);

  if (res.status !== 402) {
    console.log(
      "⚠️  402 以外のステータスが返りました（無料エンドポイントではありませんか？）",
    );
    return false;
  }

  // 402 レスポンスから支払い要件を取得して表示
  // Lambda@Edge は x402 core の PAYMENT-REQUIRED ヘッダーを payment-required として転送する
  const paymentHeader =
    res.headers.get("payment-required") ??
    res.headers.get("x-payment-required");
  if (paymentHeader) {
    console.log("\nPayment Requirements:");
    // ヘッダーは base64 エンコードされているのでデコードして表示
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
  // 402 を取得して支払い要件を表示
  const has402 = await step1_showPaymentRequired();
  if (!has402) process.exit(1);

  console.log("\n" + LINE);
  console.log("Step 2: 支払いペイロードを署名生成（オンチェーン決済はしない）");
  console.log(LINE);
  console.log("Wallet: " + signer.address);
  // USDC 残高を表示（残高不足の警告も）
  const balance = await getUsdcBalance();
  if (balance !== null) {
    console.log("Balance: " + balance.toFixed(6) + " USDC (Base Sepolia)");
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
    // ヘッダーから Payment-Signature を取得（大文字小文字の両方に対応）
    const headers = (init?.headers ?? {}) as Record<string, string>;
    // ヘッダー名はサーバー実装により異なる可能性があるため、両方のケースをチェック
    const sig =
      headers["Payment-Signature"] ?? headers["payment-signature"] ?? null;

    if (sig) {
      capturedSignature = sig;
      // モック 200 を返して実際のリクエストを送らない
      return new Response(
        JSON.stringify({ captured: true, message: "Payload captured" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return fetch(input, init);
  };

  // x402 クライアントと fetch をラップして支払いペイロードを生成
  const fetchWithPayment = wrapFetchWithPayment(
    interceptFetch as typeof fetch,
    x402,
  );

  // 402 をトリガーしてペイロードを生成 → シグネチャをキャプチャ
  await fetchWithPayment(targetUrl);

  if (!capturedSignature) {
    console.error("\n支払いシグネチャの生成に失敗しました。");
    process.exit(1);
  }

  console.log("\n" + LINE_DOUBLE);
  console.log("生成された Payment-Signature (test.http の @paymentPayload に貼り付け):");
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
  // 402 を取得して支払い要件を表示
  const has402 = await step1_showPaymentRequired();
  if (!has402) process.exit(1);

  console.log("\n" + LINE);
  console.log("Step 2 + 3: 支払い → オリジンからレスポンス取得");
  console.log(LINE);
  console.log("Wallet: " + signer.address);
  // USDC 残高を表示（残高不足の警告も）
  const balanceBefore = await getUsdcBalance();
  if (balanceBefore !== null) {
    console.log("Balance (before): " + balanceBefore.toFixed(6) + " USDC");
  }

  console.log("\n支払い中...");
  // x402 クライアントと fetch をラップして支払いペイロードを生成 → 署名 → 決済 → 再送 → オリジンからレスポンスを取得
  const fetchWithPayment = wrapFetchWithPayment(fetch, x402);
  const response = await fetchWithPayment(targetUrl);

  console.log("\nStatus: " + response.status + " " + response.statusText);
  // レスポンスボディをテキストで取得して表示（JSON なら整形して表示）
  const bodyText = await response.text();
  try {
    console.log("Response:", JSON.stringify(JSON.parse(bodyText), null, 2));
  } catch {
    console.log("Response:", bodyText);
  }

  const balanceAfter = await getUsdcBalance();
  if (balanceAfter !== null) {
    console.log("\nBalance (after): " + balanceAfter.toFixed(6) + " USDC");
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
console.log("x402 Payment Script");
console.log(
  "Mode:     " +
    (isFullPay
      ? "フル支払い (--pay) ※ 実際に USDC を消費します"
      : "ペイロード生成のみ (デフォルト)"),
);
console.log("Endpoint: " + endpoint);

if (isFullPay) {
  // 支払いペイロードを生成して署名 → 決済 → 再送 → オリジンからレスポンスを取得
  await fullPayment();
} else {
  // 支払いペイロードを生成して署名 → シグネチャをキャプチャ（決済はしない）
  await generatePayloadOnly();
}
