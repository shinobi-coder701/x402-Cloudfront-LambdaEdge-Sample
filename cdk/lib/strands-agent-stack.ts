import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as python from "@aws-cdk/aws-lambda-python-alpha";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import { Construct } from "constructs";

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

	constructor(scope: Construct, id: string, props: StrandsAgentStackProps) {
		super(scope, id, props);

		const fn = new python.PythonFunction(this, "StrandsAgent", {
			entry: path.join(__dirname, "../functions/strands-agent"),
			index: "agent.py",
			handler: "handler",
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

		new cdk.CfnOutput(this, "StrandsAgentApiUrl", {
			value: this.apiUrl,
			description: "Strands Agent API URL — used by FrontendStack",
		});
	}
}
