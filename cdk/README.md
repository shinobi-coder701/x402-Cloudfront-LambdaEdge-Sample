# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

## 注意事項

CDKスタックデプロイ時に以下の2点を注意

- フロントのAPIを最新化してからビルドし再度デプロイすること
- Secret Managerにシークレット値(秘密鍵)を登録すること

## 参考情報
- [実際のトランザクション記録](https://sepolia.basescan.org/tx/0x9cdbb690d4740a30b98e7cc60ee45a819a909721f4c470ae25b808f510d3fc64)