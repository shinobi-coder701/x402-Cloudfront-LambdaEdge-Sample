import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "path";

export interface PaymentProxyStackProps extends cdk.StackProps {
	/** CloudFront distribution URL from CdkStack */
	cloudFrontUrl: string;
	/** EVM private key secret from SecretsStack */
	evmPrivateKeySecret: secretsmanager.ISecret;
	/** Solana private key secret from SecretsStack */
	svmPrivateKeySecret: secretsmanager.ISecret;
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

	/**
	 * コンストラクター
	 * @param scope
	 * @param id
	 * @param props
	 */
	constructor(scope: Construct, id: string, props: PaymentProxyStackProps) {
		super(scope, id, props);

		// Proxy用のLambda関数
		const fn = new nodejs.NodejsFunction(this, "PaymentProxy", {
			entry: path.join(__dirname, "../functions/payment-proxy/index.ts"),
			runtime: lambda.Runtime.NODEJS_22_X,
			memorySize: 512,
			timeout: cdk.Duration.seconds(30),
			environment: {
				CLOUDFRONT_URL: props.cloudFrontUrl,
				EVM_PRIVATE_KEY_SECRET_ARN: props.evmPrivateKeySecret.secretArn,
				SVM_PRIVATE_KEY_SECRET_ARN: props.svmPrivateKeySecret.secretArn,
			},
			bundling: {
				// payment-proxy の依存をバンドルする（EVM + Solana 両対応）
				nodeModules: [
					"@x402/core",
					"@x402/evm",
					"@x402/svm",
					"@x402/fetch",
					"viem",
					"@solana/kit",
					"bs58",
				],
				externalModules: ["@aws-sdk/*"],
			},
			description:
				"x402 payment proxy — auto-pays 402 responses before returning content",
		});

		// SecretsManager から EVM / Solana private key を読む権限
		props.evmPrivateKeySecret.grantRead(fn);
		props.svmPrivateKeySecret.grantRead(fn);

		// API GatewayとLambda関数を紐付け
		// proxy: false で個別リソースを定義する
		// (proxy: true だと /{proxy+} のみが OpenAPI spec に登録され、
		//  AgentCore Gateway の ToolFilter が個別パスを認識できない)
		this.api = new apigw.LambdaRestApi(this, "PaymentProxyApi", {
			handler: fn,
			proxy: false,
			description: "x402 Payment Proxy API — wraps CloudFront paid endpoints",
			deployOptions: {
				stageName: "v1",
			},
		});

		// /proxy/hello, /proxy/premium, /proxy/article を明示的に登録
		// methodResponses を定義しないと OpenAPI spec に responses が含まれず
		// AgentCore Gateway が "responses is missing" エラーを返す
		const methodOptions: apigw.MethodOptions = {
			methodResponses: [{ statusCode: "200" }],
		};
		const proxyResource = this.api.root.addResource("proxy");
		proxyResource.addResource("hello").addMethod("GET", undefined, methodOptions);
		proxyResource
			.addResource("premium")
			.addMethod("GET", undefined, methodOptions);
		proxyResource
			.addResource("article")
			.addMethod("GET", undefined, methodOptions);

		this.apiUrl = this.api.url;

		// ===========================================================================
		// 成果物
		// ===========================================================================

		new cdk.CfnOutput(this, "PaymentProxyApiUrl", {
			value: this.apiUrl,
			description: "Payment Proxy API URL",
		});
	}
}
