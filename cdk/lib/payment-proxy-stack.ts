import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as path from "path";
import { Construct } from "constructs";

export interface PaymentProxyStackProps extends cdk.StackProps {
	/** CloudFront distribution URL from CdkStack */
	cloudFrontUrl: string;
	/** EVM private key secret from SecretsStack */
	evmPrivateKeySecret: secretsmanager.ISecret;
}

/**
 * Phase 3: PaymentProxyStack
 *
 * x402 の支払いフローを内部で完結させるプロキシレイヤー。
 * - GET /proxy/hello   → CloudFront /api/hello      ($0.001 USDC)
 * - GET /proxy/premium → CloudFront /api/premium/data ($0.01 USDC)
 * - GET /proxy/article → CloudFront /content/article ($0.005 USDC)
 *
 * Lambda は 402 → 署名 → リトライ のサイクルを自動処理し、
 * 呼び出し元（AgentCore Gateway）は x402 を意識せずに使える。
 */
export class PaymentProxyStack extends cdk.Stack {
	/** API Gateway URL — FrontendStack 等から参照 */
	public readonly apiUrl: string;
	/** API Gateway REST API — AgentCore Gateway の addApiGatewayTarget に渡す */
	public readonly api: apigw.LambdaRestApi;

	constructor(scope: Construct, id: string, props: PaymentProxyStackProps) {
		super(scope, id, props);

		const fn = new nodejs.NodejsFunction(this, "PaymentProxy", {
			entry: path.join(__dirname, "../functions/payment-proxy/index.ts"),
			runtime: lambda.Runtime.NODEJS_22_X,
			memorySize: 512,
			timeout: cdk.Duration.seconds(30),
			environment: {
				CLOUDFRONT_URL: props.cloudFrontUrl,
				EVM_PRIVATE_KEY_SECRET_ARN: props.evmPrivateKeySecret.secretArn,
			},
			bundling: {
				// payment-proxy/package.json の依存をバンドルする
				nodeModules: ["@x402/core", "@x402/evm", "@x402/fetch", "viem"],
				externalModules: ["@aws-sdk/*"],
			},
			description: "x402 payment proxy — auto-pays 402 responses before returning content",
		});

		// SecretsManager から EVM private key を読む権限
		props.evmPrivateKeySecret.grantRead(fn);

		this.api = new apigw.LambdaRestApi(this, "PaymentProxyApi", {
			handler: fn,
			proxy: true,
			description: "x402 Payment Proxy API — wraps CloudFront paid endpoints",
			deployOptions: {
				stageName: "v1",
			},
		});

		this.apiUrl = this.api.url;

		new cdk.CfnOutput(this, "PaymentProxyApiUrl", {
			value: this.apiUrl,
			description: "Payment Proxy API URL",
		});
	}
}
