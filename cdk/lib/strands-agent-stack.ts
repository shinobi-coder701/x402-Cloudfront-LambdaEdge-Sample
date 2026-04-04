import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { spawnSync } from "child_process";
import { Construct } from "constructs";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export interface StrandsAgentStackProps extends cdk.StackProps {
	/** MCP endpoint URL from AgentCoreGatewayStack */
	mcpEndpointUrl: string;
}

/**
 * Phase 5: StrandsAgentStack
 *
 * Strands Agent (Python) を Lambda で動かす。
 * AgentCore Gateway に MCP プロトコル + AWS IAM 認証で接続し、
 * x402 保護コンテンツへのアクセスを自然言語で処理する。
 *
 * フロントエンドからは POST /invoke にメッセージを送るだけ。
 */
export class StrandsAgentStack extends cdk.Stack {
	/** API Gateway URL — FrontendStack に渡す */
	public readonly apiUrl: string;

	/**
	 * コンストラクター
	 * @param scope
	 * @param id
	 * @param props
	 */
	constructor(scope: Construct, id: string, props: StrandsAgentStackProps) {
		super(scope, id, props);

		const entryDir = path.join(__dirname, "../functions/strands-agent");

		// ── Python Lambda コードのバンドル ───────────────────────────────────────
		// Docker バンドリング:
		//   aws-lambda/python3.12 (Amazon Linux 2) イメージ上で pip install を実行
		//   → ネイティブバイナリ (pydantic_core 等) が Lambda ランタイムと完全一致
		// ローカルバンドリング (Docker 不可時のフォールバック):
		//   --platform / --python-version / --only-binary で
		//   manylinux x86_64 cp312 ホイールを強制ダウンロード
		//
		// アセットハッシュにソースファイルの内容 + バンドルバージョンを含め、
		// バンドリング設定変更時にも Lambda コードが確実に更新されるようにする
		const BUNDLE_VERSION = "v3"; // バンドリング修正時にインクリメント
		const sourceFiles = fs
			.readdirSync(entryDir)
			.filter((f) => !f.startsWith(".") && f !== "__pycache__" && f !== "node_modules")
			.sort()
			.map((f) => {
				const content = fs.readFileSync(path.join(entryDir, f));
				return crypto.createHash("md5").update(content).digest("hex");
			})
			.join("");
		const assetHash = crypto
			.createHash("md5")
			.update(sourceFiles + BUNDLE_VERSION)
			.digest("hex");

		const agentCode = lambda.Code.fromAsset(entryDir, {
			assetHash,
			assetHashType: cdk.AssetHashType.CUSTOM,
			bundling: {
				local: {
					tryBundle(outputDir: string): boolean {
						const pythonCandidates = ["python3.12", "python3.11", "python3.10"];
						const pythonBin = pythonCandidates.find((bin) => {
							const r = spawnSync(bin, ["--version"], { stdio: "pipe" });
							return r.status === 0;
						});
						if (!pythonBin) return false;

						// pip install: Lambda x86_64 + Python 3.12 用ホイールを強制取得
						const install = spawnSync(
							pythonBin,
							[
								"-m",
								"pip",
								"install",
								"-r",
								"requirements.txt",
								"-t",
								outputDir,
								"--platform",
								"manylinux2014_x86_64",
								"--implementation",
								"cp",
								"--python-version",
								"3.12",
								"--only-binary",
								":all:",
								"--quiet",
							],
							{ cwd: entryDir, stdio: "inherit" },
						);
						if (install.status !== 0) return false;

						// ソースファイルを outputDir へコピー
						for (const file of fs.readdirSync(entryDir)) {
							if (file === "__pycache__") continue;
							fs.copyFileSync(
								path.join(entryDir, file),
								path.join(outputDir, file),
							);
						}
						return true;
					},
				},
				// Docker フォールバック
				image: lambda.Runtime.PYTHON_3_12.bundlingImage,
				command: [
					"bash",
					"-c",
					"pip install -r requirements.txt -t /asset-output --quiet && cp -r . /asset-output",
				],
			},
		});

		// Strands Agent 用の Lambda 関数の設定
		const fn = new lambda.Function(this, "StrandsAgent", {
			code: agentCode,
			handler: "agent.handler",
			runtime: lambda.Runtime.PYTHON_3_12,
			memorySize: 1024,
			timeout: cdk.Duration.minutes(5),
			environment: {
				AGENT_CORE_GATEWAY_MCP_URL: props.mcpEndpointUrl,
			},
			description:
				"Strands Agent with MCP tools via AgentCore Gateway (x402 auto-payment)",
		});

		// Bedrock モデル呼び出し権限
		fn.addToRolePolicy(
			new iam.PolicyStatement({
				actions: [
					"bedrock:InvokeModel",
					"bedrock:InvokeModelWithResponseStream",
				],
				resources: [
					"arn:aws:bedrock:*::foundation-model/anthropic.claude-*",
					"arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-*",
				],
			}),
		);

		// AgentCore Gateway 呼び出し権限
		fn.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ["bedrock-agentcore:InvokeGateway"],
				// Gateway ARN が確定後に絞り込むことを推奨
				resources: ["*"],
			}),
		);

		// APIGatewayとLambda関数の紐付け
		const api = new apigw.LambdaRestApi(this, "StrandsAgentApi", {
			handler: fn,
			proxy: true,
			description:
				"Strands Agent API — natural language interface for x402 content",
			defaultCorsPreflightOptions: {
				allowOrigins: apigw.Cors.ALL_ORIGINS,
				allowMethods: apigw.Cors.ALL_METHODS,
				allowHeaders: ["Content-Type"],
			},
			deployOptions: {
				stageName: "v1",
			},
		});

		// Lambda エラー (5xx) 時にも CORS ヘッダーを返す
		// Lambda がクラッシュすると API Gateway 自体がレスポンスを生成するため
		// Gateway Response レベルで CORS を設定しないとブラウザに CORS エラーが出る
		api.addGatewayResponse("Default5xx", {
			type: apigw.ResponseType.DEFAULT_5XX,
			responseHeaders: {
				"Access-Control-Allow-Origin": "'*'",
				"Access-Control-Allow-Headers": "'Content-Type'",
			},
		});
		api.addGatewayResponse("Default4xx", {
			type: apigw.ResponseType.DEFAULT_4XX,
			responseHeaders: {
				"Access-Control-Allow-Origin": "'*'",
				"Access-Control-Allow-Headers": "'Content-Type'",
			},
		});

		this.apiUrl = api.url;

		// ===========================================================================
		// 成果物
		// ===========================================================================

		new cdk.CfnOutput(this, "StrandsAgentApiUrl", {
			value: this.apiUrl,
			description: "Strands Agent API URL — used by FrontendStack",
		});
	}
}
