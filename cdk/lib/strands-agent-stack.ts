import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { spawnSync } from "child_process";
import { Construct } from "constructs";
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
		// ローカルバンドリング (fast path, Docker 不要):
		//   1. Python 3.10+ を探す (strands-agents は Python>=3.10 が必須)
		//   2. pip install -r requirements.txt をホストで実行し outputDir へ展開
		//   3. ソースファイルを outputDir へコピー
		// Docker フォールバック (CI 等ローカル Python が使えない環境向け):
		//   aws-lambda/python3.12 イメージで同様の処理を実行
		const agentCode = lambda.Code.fromAsset(entryDir, {
			bundling: {
				local: {
					tryBundle(outputDir: string): boolean {
						// Python 3.12 → 3.11 → 3.10 の順で利用可能なものを探す
						// (strands-agents は Python>=3.10 が必要なため 3.9 は除外)
						const pythonCandidates = ["python3.12", "python3.11", "python3.10"];
						const pythonBin = pythonCandidates.find((bin) => {
							const r = spawnSync(bin, ["--version"], { stdio: "pipe" });
							return r.status === 0;
						});
						if (!pythonBin) return false;

						// 依存パッケージを outputDir へインストール
						const install = spawnSync(
							pythonBin,
							[
								"-m", "pip",
								"install",
								"-r", "requirements.txt",
								"-t", outputDir,
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
			description: "Strands Agent API — natural language interface for x402 content",
			defaultCorsPreflightOptions: {
				allowOrigins: apigw.Cors.ALL_ORIGINS,
				allowMethods: apigw.Cors.ALL_METHODS,
				allowHeaders: ["Content-Type"],
			},
			deployOptions: {
				stageName: "v1",
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
