# Project Overview: x402-Cloudfront-LambdaEdge-Sample

## Purpose
x402 (HTTP 402 Payment Required) プロトコルを使って AWS CloudFront + Lambda@Edge でHTTPリクエストをマネタイズするサンプル実装。

CloudFront エッジで HTTP リクエストをインターセプトし、Lambda@Edge が x402 ペイメントトークンを検証してバックエンドオリジンへのアクセスをゲートする。

## Payment Flow
1. Client → CloudFront → Lambda@Edge（origin-request）: トークンなし → 402 返却（X-Payment-Response ヘッダーに価格/ネットワーク/ファシリテーター情報）
2. Client が Base ネットワーク（testnet: Base Sepolia）で USDC を支払う
3. Client が `X-Payment-Token` ヘッダーにトークンを付けて再リクエスト
4. Lambda@Edge がファシリテーターでトークンを検証 → 成功時にオリジンへフォワード
5. Lambda@Edge（origin-response）が支払いを決済

## Network Config
- 開発: Base Sepolia testnet (eip155:84532)
- 本番: Base mainnet + USDC
- Facilitator: https://x402.org/facilitator

## Architecture
```
Client → CloudFront → Lambda@Edge (origin-request) → API Gateway → Lambda (Demo)
                    ← Lambda@Edge (origin-response) ←
```

- `/api/*`, `/content/*`: 支払いチェックあり
- `/` (default): 支払いなし・フリー
