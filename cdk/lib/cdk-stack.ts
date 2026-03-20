import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as cdk from "aws-cdk-lib/core";
import { spawnSync } from "child_process";
import { Construct } from "constructs";
import * as path from "path";

/**
 * CDKスタックファイル
 * このスタックは、CloudFrontディストリビューション、API Gateway、Lambda@Edge関数を定義しています。
 * Lambda@Edge関数は、CloudFrontのオリジンリクエストとオリジンレスポンスイベントにアタッチされ、
 * x402プロトコルに基づいて支払いの検証と決済を行います。
 *
 * 環境変数から設定値を読み取り、esbuildの--defineオプションを使用してLambda@Edgeバンドルに注入します。
 * これらの値はLambda@Edge関数内でコンパイル時定数として利用可能になります。
 *
 * デプロイ後、CloudFrontディストリビューションのURLが出力されます。/api/*と/content/*へのリクエストは
 * Lambda@Edgeによる支払いチェックを経由し、API Gatewayのバックエンドに転送されます。
 * ルートパスへのリクエストは無料で、支払いチェックなしでAPI Gatewayに転送されます。
 *
 * 注意: Lambda@Edge関数はus-east-1リージョンでデプロイされる必要があります。
 * このスタックはすべてのリソースをus-east-1に配置することで、デモをシンプルに保っています。
 */
export class CdkStack extends cdk.Stack {
	/**
	 * コンストラクター
	 * @param scope
	 * @param id
	 * @param props
	 */
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, {
			...props,
			// Lambda@Edge must be deployed in us-east-1.
			// experimental.EdgeFunction handles cross-region deployment automatically,
			// but collocating all resources in us-east-1 keeps the demo simple.
			env: {
				region: "us-east-1",
				account: props?.env?.account,
			},
		});

		// ── Config from environment variables ────────────────────────────────────
		// These are read at CDK synth time and baked into the Lambda@Edge bundle
		// via esbuild --define (Lambda@Edge does not support runtime env vars).
		const payToAddress =
			process.env.PAY_TO_ADDRESS ?? "0xYourPaymentAddressHere";
		const network = process.env.X402_NETWORK ?? "eip155:84532";
		const facilitatorUrl =
			process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";

		// ── Demo Lambda (origin) ──────────────────────────────────────────────────
		const demoFn = new nodejs.NodejsFunction(this, "DemoFunction", {
			entry: path.join(__dirname, "../functions/lambda-demo/index.ts"),
			handler: "handler",
			runtime: lambda.Runtime.NODEJS_24_X,
			bundling: {
				target: "node24",
				format: nodejs.OutputFormat.CJS,
				// aws-lambda types are dev-only; no external modules needed
				externalModules: ["@aws-sdk/*"],
			},
			description: "x402 demo origin — free and paid endpoints",
		});

		// ── API Gateway (REST) ────────────────────────────────────────────────────
		const api = new apigateway.LambdaRestApi(this, "DemoApi", {
			handler: demoFn,
			proxy: true,
			description: "x402 Demo API — origin for CloudFront distribution",
			defaultCorsPreflightOptions: {
				allowOrigins: apigateway.Cors.ALL_ORIGINS,
				allowMethods: apigateway.Cors.ALL_METHODS,
				allowHeaders: [
					"Content-Type",
					"Payment-Signature",
					"X-Payment-Response",
				],
			},
			deployOptions: {
				stageName: "v1",
				description: "x402 demo stage",
			},
		});

		// ── Lambda@Edge bundle ────────────────────────────────────────────────────
		// Both originRequestHandler and originResponseHandler live in the same
		// source tree and are bundled once, then shared across two EdgeFunctions.
		//
		// Config values are injected at bundle time via esbuild --define so they
		// are available as compile-time constants inside config.ts.
		const lambdaEdgePath = path.join(__dirname, "../functions/lambda-edge");

		// esbuild --define args: each value must be a valid JS expression.
		// JSON.stringify produces `"value"` (with double quotes) which esbuild
		// interprets as a JS string literal — exactly what we want.
		const defineArgs = [
			`--define:__PAY_TO_ADDRESS__=${JSON.stringify(payToAddress)}`,
			`--define:__X402_NETWORK__=${JSON.stringify(network)}`,
			`--define:__FACILITATOR_URL__=${JSON.stringify(facilitatorUrl)}`,
		];

		const edgeCode = lambda.Code.fromAsset(lambdaEdgePath, {
			bundling: {
				// ── Local bundling (fast path, no Docker needed) ──────────────────
				// spawnSync avoids shell quoting issues — args are passed directly
				// to the process without shell interpretation.
				local: {
					tryBundle(outputDir: string): boolean {
						// Install @x402/* deps via bun (respects project's bun setup)
						const install = spawnSync("bun", ["install"], {
							cwd: lambdaEdgePath,
							stdio: "inherit",
						});
						if (install.status !== 0) return false;

						const esbuildBin = path.join(
							lambdaEdgePath,
							"node_modules/.bin/esbuild",
						);
						const bundle = spawnSync(
							esbuildBin,
							[
								"src/index.ts",
								"--bundle",
								"--platform=node",
								"--target=node24",
								"--format=cjs",
								"--external:@aws-sdk/*",
								...defineArgs,
								`--outfile=${outputDir}/index.js`,
							],
							{ cwd: lambdaEdgePath, stdio: "inherit" },
						);
						return bundle.status === 0;
					},
				},
				// ── Docker fallback (used in CI without bun/Node locally) ─────────
				// Single-quoted shell args prevent glob/variable expansion.
				image: lambda.Runtime.NODEJS_24_X.bundlingImage,
				command: [
					"bash",
					"-c",
					"npm install --silent && " +
						"node_modules/.bin/esbuild src/index.ts " +
						"--bundle --platform=node --target=node24 --format=cjs " +
						"'--external:@aws-sdk/*' " +
						defineArgs.map((d) => `'${d}'`).join(" ") +
						" --outfile=/asset-output/index.js",
				],
			},
		});

		// ── Lambda@Edge: origin-request (payment verification) ───────────────────
		const originRequestFn = new cloudfront.experimental.EdgeFunction(
			this,
			"OriginRequestFn",
			{
				runtime: lambda.Runtime.NODEJS_24_X,
				handler: "index.originRequestHandler",
				code: edgeCode,
				memorySize: 128,
				// Lambda@Edge viewer/origin-request max timeout: 30 s
				timeout: cdk.Duration.seconds(20),
				description:
					"x402 origin-request: verify payment before forwarding to origin",
			},
		);

		// ── Lambda@Edge: origin-response (payment settlement) ────────────────────
		const originResponseFn = new cloudfront.experimental.EdgeFunction(
			this,
			"OriginResponseFn",
			{
				runtime: lambda.Runtime.NODEJS_24_X,
				handler: "index.originResponseHandler",
				code: edgeCode,
				memorySize: 128,
				timeout: cdk.Duration.seconds(20),
				description:
					"x402 origin-response: settle payment after origin succeeds",
			},
		);

		// ── Cache policies ────────────────────────────────────────────────────────
		// 課金保護されたルートではキャッシュを完全に無効化し、すべてのリクエストが
		// Lambda@Edge を通過し、CloudFront キャッシュから返されないようにする。
		const noCachePolicy = new cloudfront.CachePolicy(this, "NoCachePolicy", {
			defaultTtl: cdk.Duration.seconds(0),
			minTtl: cdk.Duration.seconds(0),
			maxTtl: cdk.Duration.seconds(0),
			// QueryStringBehavior cannot be set when caching is disabled (all TTLs = 0).
			// Query string forwarding to origin is handled by paymentOriginPolicy instead.
			cookieBehavior: cloudfront.CacheCookieBehavior.none(),
		});

		// Forward payment header to origin so the demo Lambda can read it if needed
		const paymentOriginPolicy = new cloudfront.OriginRequestPolicy(
			this,
			"PaymentOriginPolicy",
			{
				headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
					"Payment-Signature",
					"Content-Type",
					"Accept",
				),
				queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
				cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
			},
		);

		// ── CloudFront origin ─────────────────────────────────────────────────────
		// API Gateway REST API endpoint (strip the stage prefix added by API GW)
		const apiGwDomain = `${api.restApiId}.execute-api.${this.region}.amazonaws.com`;
		const apiOrigin = new origins.HttpOrigin(apiGwDomain, {
			originPath: `/${api.deploymentStage.stageName}`,
			protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
		});

		// Edge Lambda attachments shared by all payment-protected behaviors
		const paymentEdgeLambdas: cloudfront.EdgeLambda[] = [
			{
				functionVersion: originRequestFn.currentVersion,
				eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
				includeBody: false,
			},
			{
				functionVersion: originResponseFn.currentVersion,
				eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
			},
		];

		// ── CloudFront Distribution ───────────────────────────────────────────────
		const distribution = new cloudfront.Distribution(this, "Distribution", {
			comment: "x402 Demo — CloudFront + Lambda@Edge payment gateway",
			// Default behavior: free endpoints, no payment check
			defaultBehavior: {
				origin: apiOrigin,
				cachePolicy: noCachePolicy,
				originRequestPolicy: paymentOriginPolicy,
				allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
				viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
			},
			// /api/* — payment protected ($0.001 – $0.01 USDC)
			additionalBehaviors: {
				"/api/*": {
					origin: apiOrigin,
					cachePolicy: noCachePolicy,
					originRequestPolicy: paymentOriginPolicy,
					allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
					viewerProtocolPolicy:
						cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
					edgeLambdas: paymentEdgeLambdas,
				},
				// /content/* — payment protected ($0.005 USDC)
				"/content/*": {
					origin: apiOrigin,
					cachePolicy: noCachePolicy,
					originRequestPolicy: paymentOriginPolicy,
					allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
					viewerProtocolPolicy:
						cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
					edgeLambdas: paymentEdgeLambdas,
				},
			},
		});

    // ================================================================================
		// ── Outputs ───────────────────────────────────────────────────────────────
    // ================================================================================

		new cdk.CfnOutput(this, "CloudFrontUrl", {
			value: `https://${distribution.distributionDomainName}`,
			description:
				"Entry point — all requests go through x402 Lambda@Edge for /api/* and /content/*",
		});

		new cdk.CfnOutput(this, "ApiGatewayUrl", {
			value: api.url,
			description:
				"API Gateway direct URL — useful for testing without x402 payment check",
		});

		new cdk.CfnOutput(this, "FreeEndpoint", {
			value: `https://${distribution.distributionDomainName}/`,
			description: "Free welcome endpoint (no payment required)",
		});

		new cdk.CfnOutput(this, "PaidEndpointHello", {
			value: `https://${distribution.distributionDomainName}/api/hello`,
			description: "Paid endpoint — $0.001 USDC (Base Sepolia)",
		});

		new cdk.CfnOutput(this, "PaidEndpointPremium", {
			value: `https://${distribution.distributionDomainName}/api/premium/data`,
			description: "Paid endpoint — $0.01 USDC (Base Sepolia)",
		});

		new cdk.CfnOutput(this, "PaidEndpointContent", {
			value: `https://${distribution.distributionDomainName}/content/article`,
			description: "Paid endpoint — $0.005 USDC (Base Sepolia)",
		});

		cdk.Tags.of(this).add("Project", "x402-cloudfront-demo");
		cdk.Tags.of(this).add("Protocol", "x402");
		cdk.Tags.of(this).add("Network", network);
	}
}
