# Suggested Commands

すべてのコマンドは `cdk/` ディレクトリから実行する。

## 開発
```bash
cd cdk

# 依存インストール (bun を使うこと。npm install は使わない)
bun install

# TypeScript ビルド
npm run build

# ウォッチモード
npm run watch
```

## 品質チェック（タスク完了時に実行）
```bash
cd cdk

# フォーマット（Biome）
npm run format

# テスト
npm run test

# 単一テストファイル実行
npx jest test/cdk.test.ts
```

## CDK 操作
```bash
cd cdk

npx cdk synth    # CloudFormation テンプレート生成
npx cdk diff     # デプロイ済みスタックとの差分
npx cdk deploy   # AWS へデプロイ
```

## システムユーティリティ（Darwin/macOS）
```bash
ls, find, grep, git, cd
# GNU と BSD の違いに注意（例: sed -i '' はmacOS流）
```
