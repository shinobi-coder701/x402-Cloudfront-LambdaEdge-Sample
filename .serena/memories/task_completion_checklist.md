# Task Completion Checklist

タスク完了時は以下の順序で実行する（`cdk/` ディレクトリから）:

1. **ビルド確認**
   ```bash
   npm run build
   ```

2. **フォーマット・リント**
   ```bash
   npm run format
   ```

3. **テスト実行**
   ```bash
   npm run test
   ```

4. **CDK テンプレート検証（インフラ変更時のみ）**
   ```bash
   npx cdk synth
   ```

## 注意事項
- `bun install` で依存関係をインストール（`npm install` は使わない）
- Lambda@Edge 関連の変更は必ず `us-east-1` でデプロイされることを確認
- `config.ts` の設定値は `.env` から読み込まれ、esbuild `--define` で注入される
- テストスナップショット（`test/__snapshots__/`）は CDK スタック変更時に更新が必要な場合がある
