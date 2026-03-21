import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";
import * as path from "path";
import { Construct } from "constructs";

export interface AgentCoreGatewayStackProps extends cdk.StackProps {
	/** Payment Proxy REST API from PaymentProxyStack */
	paymentProxyApi: apigw.IRestApi;
}

/**
 * Phase 4: AgentCoreGatewayStack
 *
 * AgentCore Gateway を MCP サーバーとして設定する。
 * Payment Proxy API を API Gateway ターゲットとして MCP ツールに公開し、
 * Strands Agent が MCP プロトコルでツールを呼べるようにする。
 *
 * 対応リージョン: us-east-1, us-east-2, us-west-2, ap-northeast-1 他
 */
export class AgentCoreGatewayStack extends cdk.Stack {
	/** Gateway ARN */
	public readonly gatewayArn: string;
	/** MCP エンドポイント URL (Strands Agent が接続する) */
	public readonly mcpEndpointUrl: string;

	constructor(
		scope: Construct,
		id: string,
		props: AgentCoreGatewayStackProps,
	) {
		super(scope, id, props);

		// AgentCore Gateway (L2 alpha construct)
		// ProtocolType: MCP — クライアントは MCP プロトコルで接続する
		// ロールは自動生成される (target 追加時に権限が自動付与される)
		const gateway = new agentcore.Gateway(this, "X402Gateway", {
			gatewayName: "x402-payment-gateway",
			description: "MCP server wrapping x402-protected CloudFront content",
			protocolConfiguration: agentcore.GatewayProtocol.mcp({
				supportedVersions: [agentcore.MCPProtocolVersion.MCP_2025_03_26],
				instructions:
					"Use these tools to access x402-protected premium content. Payment is handled automatically.",
			}),
		});

		// Payment Proxy API をツールとして公開
		// addApiGatewayTarget は IAM 権限を自動付与する
		gateway.addApiGatewayTarget("PaymentProxyTarget", {
			gatewayTargetName: "x402-payment-proxy",
			description:
				"x402 auto-payment proxy for CloudFront-protected content",
			restApi: props.paymentProxyApi,
			apiGatewayToolConfiguration: {
				toolFilters: [
					{
						filterPath: "/proxy/hello",
						methods: [agentcore.ApiGatewayHttpMethod.GET],
					},
					{
						filterPath: "/proxy/premium",
						methods: [agentcore.ApiGatewayHttpMethod.GET],
					},
					{
						filterPath: "/proxy/article",
						methods: [agentcore.ApiGatewayHttpMethod.GET],
					},
				],
				toolOverrides: [
					{
						path: "/proxy/hello",
						method: agentcore.ApiGatewayHttpMethod.GET,
						name: "getHelloContent",
						description: "Get hello content (auto-pays $0.001 USDC on Base Sepolia)",
					},
					{
						path: "/proxy/premium",
						method: agentcore.ApiGatewayHttpMethod.GET,
						name: "getPremiumData",
						description: "Get premium analytics data (auto-pays $0.01 USDC on Base Sepolia)",
					},
					{
						path: "/proxy/article",
						method: agentcore.ApiGatewayHttpMethod.GET,
						name: "getArticleContent",
						description: "Get article content (auto-pays $0.005 USDC on Base Sepolia)",
					},
				],
			},
		});

		this.gatewayArn = gateway.gatewayArn;
		// MCP エンドポイント URL
		// 例: https://<id>.gateway.bedrock-agentcore.<region>.amazonaws.com/mcp
		this.mcpEndpointUrl = gateway.gatewayUrl ?? `https://unknown.gateway.bedrock-agentcore.${this.region}.amazonaws.com/mcp`;

		new cdk.CfnOutput(this, "GatewayArn", {
			value: this.gatewayArn,
			description: "AgentCore Gateway ARN",
		});

		new cdk.CfnOutput(this, "McpEndpointUrl", {
			value: this.mcpEndpointUrl,
			description: "MCP endpoint URL for Strands Agent connection",
		});
	}
}
