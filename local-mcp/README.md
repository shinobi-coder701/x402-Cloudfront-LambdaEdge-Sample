# local-mcp

`local-mcp` は、x402 で保護された CloudFront エンドポイントに対して、ローカルから MCP (Model Context Protocol) ツールとしてアクセスするためのサーバーです。

このサーバーを Claude Desktop などの MCP クライアントに接続することで、以下をエージェント経由で実行できます。

- 402 レスポンスから支払い要件を確認
- Base Sepolia / Solana Devnet の USDC 残高確認
- Payment-Signature の生成 (課金なし)
- 実際に支払いを行ってエンドポイントにアクセス

## 前提

- Bun
- x402 ゲートウェイがデプロイ済みの CloudFront URL
- Base Sepolia または Solana Devnet の秘密鍵

## セットアップ

1. 依存関係をインストール

```bash
cd local-mcp
bun install
```

2. 環境変数を設定

```bash
cp .env.example .env
```

`.env` には以下を設定します。

- `CLOUDFRONT_URL`: 例 `https://xxxx.cloudfront.net`
- `EVM_PRIVATE_KEY`: Base Sepolia 用秘密鍵 (`0x...`)
- `SVM_PRIVATE_KEY`: Solana Devnet 用秘密鍵 (base58)

## 実行

```bash
cd local-mcp
bun run index.ts
```

このサーバーは `stdio` トランスポートで動作するため、通常は MCP クライアント側から起動されます。

## Claude Desktop 接続例

```json
{
  "mcpServers": {
    "x402-cloudfront-local": {
      "command": "bun",
      "args": [
        "run",
        "/absolute/path/to/x402-Cloudfront-LambdaEdge-Sample/local-mcp/index.ts"
      ],
      "env": {
        "CLOUDFRONT_URL": "https://xxxx.cloudfront.net",
        "EVM_PRIVATE_KEY": "0x...",
        "SVM_PRIVATE_KEY": "..."
      }
    }
  }
}
```

## 提供ツール

- `x402_check_payment_requirements`
  - 対象エンドポイントにアクセスして `402 Payment Required` を発生させ、支払い要件を取得
- `x402_get_usdc_balance_base_sepolia`
  - Base Sepolia の USDC 残高を取得
- `x402_get_usdc_balance_solana_devnet`
  - Solana Devnet の USDC 残高を取得
- `x402_generate_payment_signature_evm`
  - EVM 用の `Payment-Signature` を生成 (課金なし)
- `x402_generate_payment_signature_solana`
  - Solana 用の `Payment-Signature` を生成 (課金なし)
- `x402_pay_endpoint_evm`
  - EVM で実際に USDC を支払い、エンドポイント結果を取得
- `x402_pay_endpoint_solana`
  - Solana で実際に USDC を支払い、エンドポイント結果を取得

## 使用例

- 支払い要件の確認
  - `endpoint`: `/api/hello`
- 実課金アクセス
  - `endpoint`: `/api/premium/data`

## 注意事項

- `x402_pay_endpoint_evm` / `x402_pay_endpoint_solana` は実際に USDC を消費します。
- テスト用途ではまず `x402_check_payment_requirements` と `x402_generate_payment_signature_*` から試すことを推奨します。
- 秘密鍵は必ずローカルの安全な環境で管理し、Git にコミットしないでください。
