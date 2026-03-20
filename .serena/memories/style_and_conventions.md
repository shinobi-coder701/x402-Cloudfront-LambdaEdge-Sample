# Code Style and Conventions

## TypeScript
- strict モード有効（noImplicitAny, strictNullChecks, noImplicitThis, alwaysStrict）
- target: ES2022, module: NodeNext, moduleResolution: NodeNext
- outDir: `build/`
- `functions/` ディレクトリは tsconfig の exclude 対象（Lambda は個別ビルド）

## フォーマッター・リンター: Biome 2.4.8
- インデント: **タブ**（スペースではない）
- クォート: **ダブルクォート**
- import の自動整列: on
- 設定ファイル: `cdk/biome.json`

## 命名規則
- クラス: PascalCase（例: `CdkStack`, `DemoFunction`）
- 変数・関数: camelCase
- CDK コンストラクト ID: PascalCase（例: `"OriginRequestFn"`, `"DemoApi"`）
- 環境変数: UPPER_SNAKE_CASE（例: `PAY_TO_ADDRESS`, `X402_NETWORK`）

## Lambda@Edge の注意点
- Lambda@Edge はランタイム環境変数をサポートしない
- 設定値は esbuild の `--define` オプションでバンドル時に注入する（`config.ts` 内でコンパイル時定数として利用）
- Lambda@Edge は必ず `us-east-1` にデプロイする必要がある

## コメント
- 日本語と英語が混在（どちらでも可）
- JSDoc スタイルのコメントを一部使用
