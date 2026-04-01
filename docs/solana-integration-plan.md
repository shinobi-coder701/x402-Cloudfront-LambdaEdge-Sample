# Solana 対応 実装計画書

**作成日:** 2026-04-01
**対象リポジトリ:** x402-Cloudfront-LambdaEdge-Sample
**目的:** 現在 Base Sepolia (EVM) のみ対応している x402 決済ゲートウェイに Solana を追加する

---

## 1. 現状整理

### 現在の構成

```
Client
  └─▶ CloudFront
        └─▶ Lambda@Edge (origin-request)
              │  ネットワーク: eip155:84532 (Base Sepolia)
              │  署名方式: ExactEvmScheme (EIP-155)
              │  ファシリテーター: https://x402.org/facilitator
              └─▶ Origin (API Gateway / Lambda)
```

### x402 設定の流れ

```
CDK synth 時に環境変数を読む
  → esbuild --define で Lambda バンドルに埋め込み
  → Lambda@Edge は compile-time constant として参照
     (Lambda@Edge は runtime 環境変数を持てないため)
```

### 変更影響を受けるファイル

| ファイル | 役割 |
|---------|------|
| `cdk/lib/cdk-stack.ts` | ネットワーク設定の注入、esbuild define |
| `cdk/lib/secrets-stack.ts` | 秘密鍵の Secrets Manager 管理 |
| `cdk/functions/lambda-edge/src/config.ts` | x402 スキーム登録・定数定義 |
| `cdk/functions/lambda-edge/src/lib/server.ts` | x402 HTTP サーバー初期化 |
| `cdk/functions/payment-proxy/index.ts` | 自動決済署名クライアント |

---

## 2. 技術的課題

### 2.1 x402 SDK の Solana 対応状況（最大リスク）

x402 は元々 EVM 中心に設計されている。Solana 対応には以下を確認する必要がある。

```bash
# 調査コマンド
cd cdk
bun add @x402/solana 2>&1 || echo "パッケージ未存在"
node -e "const c = require('@x402/core'); console.log(Object.keys(c))"
```

**想定される結果と対応方針:**

| 状況 | 対応 |
|------|------|
| `@x402/solana` が存在する | そのまま利用 |
| `@x402/core` に Solana スキームが含まれる | import して登録 |
| 存在しない | `PaymentScheme` インターフェースを実装して自前スキームを作成 |

### 2.2 Solana の CAIP-2 ネットワーク ID

```
Devnet:  solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
Mainnet: solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
```

### 2.3 ファシリテーターの Solana 対応

`https://x402.org/facilitator` が Solana をサポートしているか確認が必要。
未対応の場合は Coinbase CDP API または自前ファシリテーターを検討する。

### 2.4 Lambda@Edge のサイズ制限

`@solana/web3.js` は重量級ライブラリ（~2MB）。
Lambda@Edge の制限: **圧縮後 1MB（viewer-request）/ 50MB（origin-request）**。
→ origin-request ハンドラーへの配置であれば通常問題なし。

---

## 3. 実装フェーズ

### Phase 0: 調査・前提確認（着手前必須）

- [ ] `@x402/solana` パッケージの存在確認
- [ ] `@x402/core` の Solana スキーム実装確認
- [ ] `x402.org/facilitator` の Solana 対応確認（API ドキュメント or 問い合わせ）
- [ ] Solana Devnet での USDC SPL トークンアドレス確認
  - HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr
- [ ] Lambda@Edge サイズへの影響確認（バンドルサイズ計測）

---

### Phase 1: Secrets Stack — Solana 秘密鍵管理

**ファイル:** `cdk/lib/secrets-stack.ts`

```typescript
// 追加: Solana Keypair を Secrets Manager に保存
this.solanaPrivateKey = new secretsmanager.Secret(this, "SolanaPrivateKey", {
  secretName: "x402/solana-keypair",
  description: "Solana keypair for x402 payment signing (base58 encoded)",
});
```

**注意点:**
- Solana の秘密鍵は base58 エンコード形式、または JSON 配列形式 (`[1,2,...,64]`)
- EVM 秘密鍵とは別シークレットとして管理する

---

### Phase 2: Lambda@Edge — 決済検証側の Solana 対応

**ファイル:** `cdk/functions/lambda-edge/src/config.ts`

```typescript
// 既存
declare const __X402_NETWORK__: string;
declare const __FACILITATOR_URL__: string;

// 追加
declare const __SOLANA_NETWORK__: string;
declare const __SOLANA_FACILITATOR_URL__: string;

export const config = {
  // 既存設定
  network: __X402_NETWORK__,
  facilitatorUrl: __FACILITATOR_URL__,

  // 追加: Solana
  solanaNetwork: __SOLANA_NETWORK__,
  solanaFacilitatorUrl: __SOLANA_FACILITATOR_URL__,

  // 対応ネットワーク一覧
  supportedNetworks: [__X402_NETWORK__, __SOLANA_NETWORK__],
};
```

**ファイル:** `cdk/functions/lambda-edge/src/lib/server.ts`

```typescript
import { ExactEvmPaymentScheme } from "@x402/evm";
import { SolanaPaymentScheme } from "@x402/solana"; // 存在確認後に追加

// Solana スキームを登録
x402.registerScheme(ExactEvmPaymentScheme);
x402.registerScheme(SolanaPaymentScheme); // 追加
```

---

### Phase 3: Payment Proxy — Solana 署名クライアント

**ファイル:** `cdk/functions/payment-proxy/index.ts`

```typescript
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { SolanaScheme, createSolanaPaymentClient } from "@x402/solana";

// Secrets Manager から Solana 秘密鍵を取得
const solanaKeyRaw = await secretsManager.send(
  new GetSecretValueCommand({ SecretId: "x402/solana-keypair" })
);
const keypair = Keypair.fromSecretKey(bs58.decode(solanaKeyRaw.SecretString!));

// Solana 決済クライアント登録
registerScheme(SolanaScheme, createSolanaPaymentClient({ keypair }));

// 既存 EVM クライアントと共存
registerScheme(ExactEvmScheme, createWalletClient({ account, transport }));
```

---

### Phase 4: CDK Stack — esbuild define に Solana 設定を追加

**ファイル:** `cdk/lib/cdk-stack.ts`

```typescript
// 環境変数の読み込み
const solanaNetwork =
  process.env.SOLANA_NETWORK ?? "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const solanaFacilitatorUrl =
  process.env.SOLANA_FACILITATOR_URL ?? "https://x402.org/facilitator";

// esbuild define に追加
"--define:__SOLANA_NETWORK__=" + JSON.stringify(solanaNetwork),
"--define:__SOLANA_FACILITATOR_URL__=" + JSON.stringify(solanaFacilitatorUrl),
```

**デプロイ時の環境変数:**

```bash
# Devnet (開発)
SOLANA_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1 \
SOLANA_FACILITATOR_URL=https://x402.org/facilitator \
npx cdk deploy

# Mainnet (本番)
SOLANA_NETWORK=solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp \
SOLANA_FACILITATOR_URL=https://x402.org/facilitator \
npx cdk deploy
```

---

### Phase 5: ルート設定の Solana 価格定義

**ファイル:** `cdk/functions/lambda-edge/src/config.ts`

```typescript
export const routes = [
  {
    path: "/api/*",
    payment: {
      // 既存: EVM
      evm: { amount: "0.001", token: "USDC", network: config.network },
      // 追加: Solana
      solana: { amount: "0.001", token: "USDC", network: config.solanaNetwork },
    },
  },
  // ...
];
```

---

### Phase 6: テスト

```typescript
// test/solana-payment.test.ts
describe("Solana Payment Flow", () => {
  it("returns 402 with solana network in payment requirements", async () => {
    // Solana ネットワークが payment-required レスポンスに含まれるか確認
  });

  it("accepts valid Solana payment token", async () => {
    // Solana 署名済みトークンで 200 が返るか確認
  });

  it("rejects invalid Solana payment token", async () => {
    // 不正トークンで 402 が返るか確認
  });
});
```

---

## 4. 依存パッケージ

```bash
cd cdk

# Solana 関連
bun add @solana/web3.js bs58

# x402 Solana スキーム（存在確認後）
bun add @x402/solana
```

---

## 5. リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| `@x402/solana` が未実装 | 高 | `PaymentScheme` インターフェースから自前実装（工数 +2-3週間） |
| ファシリテーターが Solana 未対応 | 高 | Coinbase CDP または独自ファシリテーターを構築 |
| Lambda@Edge サイズ超過 | 中 | tree-shaking 最適化、または origin-request ハンドラーへの配置で回避 |
| Solana USDC SPL アドレスの確認漏れ | 低 | Devnet/Mainnet 両方のアドレスを事前確認してハードコード |

---

## 6. 完了判定基準

- [ ] Solana Devnet 上でエンドツーエンドの決済フローが動作する
- [ ] Base Sepolia での既存フローが引き続き正常動作する
- [ ] `npm run test` が全て pass する
- [ ] Lambda@Edge バンドルサイズが制限内に収まる
- [ ] CDK デプロイが成功し、CloudFront ディストリビューションが更新される

---

## 7. 作業順序サマリー

```
Phase 0: 調査（必須）
  ↓
Phase 1: Secrets Stack に Solana 秘密鍵追加
  ↓
Phase 2: Lambda@Edge に Solana スキーム検証追加
  ↓
Phase 3: Payment Proxy に Solana 署名追加
  ↓
Phase 4: CDK Stack に Solana 環境変数注入追加
  ↓
Phase 5: ルート設定に Solana 価格定義追加
  ↓
Phase 6: テスト
```

Phase 1〜4 は並列作業可能。ただし **Phase 0 の調査結果によって Phase 2・3 の実装量が大きく変わる** ため、Phase 0 を最優先で実施すること。
