# Codebase Structure

```
x402-Cloudfront-LambdaEdge-Sample/
├── AGENTS.md / CLAUDE.md          # AI エージェント向け指示
├── README.md
├── test.http                      # HTTP リクエストサンプル
├── .claude/
│   ├── skills/
│   │   ├── x402-dev/              # x402 プロトコル実装スキル
│   │   └── aws-cdk-architect/     # CDK 設計スキル
│   └── rules/
└── cdk/                           # メインの CDK プロジェクト（ここで作業する）
    ├── bin/cdk.ts                 # CDK アプリエントリーポイント
    ├── lib/cdk-stack.ts           # メイン CDK スタック（全AWSリソース定義）
    ├── functions/
    │   ├── lambda-demo/index.ts   # デモ用オリジン Lambda（有料・無料エンドポイント）
    │   └── lambda-edge/           # Lambda@Edge ハンドラー
    │       ├── src/
    │       │   ├── index.ts       # エクスポート（originRequestHandler, originResponseHandler）
    │       │   ├── config.ts      # esbuild --define で注入される設定値
    │       │   ├── origin-request.ts   # 支払い検証ロジック
    │       │   ├── origin-response.ts  # 支払い決済ロジック
    │       │   └── lib/           # ユーティリティ（adapter, middleware, responses, server）
    │       └── package.json       # 独自の依存関係（@x402/* パッケージ）
    ├── test/cdk.test.ts           # Jest テスト
    ├── biome.json                 # フォーマッター・リンター設定
    ├── tsconfig.json              # TypeScript 設定
    ├── jest.config.js             # Jest 設定
    ├── package.json               # 依存関係・スクリプト
    └── .env / .env.example        # 環境変数
```

## 主要ファイル
- `cdk/lib/cdk-stack.ts`: AWS リソース定義のメインファイル
- `cdk/functions/lambda-edge/src/`: x402 支払いロジックの実装
- `cdk/functions/lambda-demo/index.ts`: デモ用バックエンド Lambda
