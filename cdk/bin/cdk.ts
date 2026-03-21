#!/usr/bin/env node
/**
 * CDK App entry point — x402 CloudFront + Lambda@Edge demo
 *
 * Stack 構成:
 *   CdkStack           → CloudFront + Lambda@Edge (x402 payment gate)
 *   SecretsStack       → EVM private key (SecretsManager)
 *   PaymentProxyStack  → x402 auto-payment proxy Lambda + API GW
 *   AgentCoreGateway   → MCP server (AgentCore Gateway)
 *   StrandsAgentStack  → Strands Agent Lambda + API GW
 *   FrontendStack      → React/Vite UI (CloudFront + S3)
 *
 * Required environment variables (read at synth time, baked into Lambda@Edge bundle):
 *
 *   PAY_TO_ADDRESS   Wallet address to receive USDC payments
 *                    e.g. export PAY_TO_ADDRESS=0xYourAddress
 *
 * Optional:
 *   X402_NETWORK     CAIP-2 network ID  (default: eip155:84532 = Base Sepolia)
 *   FACILITATOR_URL  x402 facilitator   (default: https://x402.org/facilitator)
 *
 * Deploy order:
 *   1. npx cdk deploy SecretsStack
 *   2. aws secretsmanager put-secret-value --secret-id x402/evm-private-key --secret-string "0x..."
 *   3. npx cdk deploy CdkStack PaymentProxyStack AgentCoreGatewayStack StrandsAgentStack
 *   4. cd frontend && bun run build
 *   5. npx cdk deploy FrontendStack
 */
import * as cdk from "aws-cdk-lib/core";
import { CdkStack } from "../lib/cdk-stack";
import { SecretsStack } from "../lib/secrets-stack";
import { PaymentProxyStack } from "../lib/payment-proxy-stack";
import { AgentCoreGatewayStack } from "../lib/agent-core-gateway-stack";
import { StrandsAgentStack } from "../lib/strands-agent-stack";
import { FrontendStack } from "../lib/frontend-stack";

const app = new cdk.App();
const env = { region: "us-east-1" };

// Stack 1: 既存 (Lambda@Edge のため us-east-1 固定)
const cdkStack = new CdkStack(app, "CdkStack", { env });

// Stack 2: Secrets Manager
const secretsStack = new SecretsStack(app, "SecretsStack", { env });

// Stack 3: Payment Proxy
const paymentProxyStack = new PaymentProxyStack(app, "PaymentProxyStack", {
	cloudFrontUrl: cdkStack.cloudFrontUrl,
	evmPrivateKeySecret: secretsStack.evmPrivateKeySecret,
	env,
});

// Stack 4: AgentCore Gateway (MCP Server)
const agentCoreGatewayStack = new AgentCoreGatewayStack(
	app,
	"AgentCoreGatewayStack",
	{
		paymentProxyApi: paymentProxyStack.api,
		env,
	},
);

// Stack 5: Strands Agent
const strandsAgentStack = new StrandsAgentStack(app, "StrandsAgentStack", {
	mcpEndpointUrl: agentCoreGatewayStack.mcpEndpointUrl,
	env,
});

// Stack 6: Frontend (CloudFront + S3)
new FrontendStack(app, "FrontendStack", {
	strandsAgentApiUrl: strandsAgentStack.apiUrl,
	env,
});
