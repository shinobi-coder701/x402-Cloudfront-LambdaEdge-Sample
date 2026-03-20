import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { CdkStack } from "../lib/cdk-stack";

// Suppress Lambda@Edge cross-region warnings in test output
const originalWarn = console.warn;
beforeAll(() => {
	console.warn = (msg: string, ...args: unknown[]) => {
		if (typeof msg === "string" && msg.includes("EdgeFunction")) return;
		originalWarn(msg, ...args);
	};
});
afterAll(() => {
	console.warn = originalWarn;
});

function buildTemplate(env?: Record<string, string>) {
	// Inject test env vars so esbuild --define values are deterministic
	const savedEnv = { ...process.env };
	Object.assign(process.env, {
		PAY_TO_ADDRESS: "0xTestWalletAddress",
		X402_NETWORK: "eip155:84532",
		FACILITATOR_URL: "https://x402.org/facilitator",
		...env,
	});

	const app = new cdk.App();
	const stack = new CdkStack(app, "TestStack", {
		env: { region: "us-east-1", account: "123456789012" },
	});
	const template = Template.fromStack(stack);

	// Restore env
	for (const key of Object.keys(process.env)) {
		if (!(key in savedEnv)) delete process.env[key];
	}
	Object.assign(process.env, savedEnv);

	return template;
}

describe("CdkStack", () => {
	let template: Template;

	beforeAll(() => {
		template = buildTemplate();
	});

	// ── API Gateway ────────────────────────────────────────────────────────────
	test("creates a Lambda REST API", () => {
		template.resourceCountIs("AWS::ApiGateway::RestApi", 1);
	});

	test("API Gateway has a deployment stage named v1", () => {
		template.hasResourceProperties("AWS::ApiGateway::Stage", {
			StageName: "v1",
		});
	});

	// ── Lambda functions ───────────────────────────────────────────────────────
	test("creates the demo Lambda function", () => {
		template.hasResourceProperties("AWS::Lambda::Function", {
			Runtime: "nodejs20.x",
		});
	});

	test("creates two Lambda@Edge functions (origin-request and origin-response)", () => {
		// Both EdgeFunctions share the same handler name prefix "index."
		template.hasResourceProperties("AWS::Lambda::Function", {
			Handler: "index.originRequestHandler",
			Runtime: "nodejs20.x",
		});
		template.hasResourceProperties("AWS::Lambda::Function", {
			Handler: "index.originResponseHandler",
			Runtime: "nodejs20.x",
		});
	});

	test("Lambda@Edge functions have 128MB memory and 20s timeout", () => {
		// Both functions share the same config — validate at least one
		template.hasResourceProperties("AWS::Lambda::Function", {
			Handler: "index.originRequestHandler",
			MemorySize: 128,
			Timeout: 20,
		});
	});

	// ── CloudFront ─────────────────────────────────────────────────────────────
	test("creates a CloudFront distribution", () => {
		template.resourceCountIs("AWS::CloudFront::Distribution", 1);
	});

	test("CloudFront distribution has HTTPS redirect", () => {
		template.hasResourceProperties("AWS::CloudFront::Distribution", {
			DistributionConfig: Match.objectLike({
				DefaultCacheBehavior: Match.objectLike({
					ViewerProtocolPolicy: "redirect-to-https",
				}),
			}),
		});
	});

	test("CloudFront has additional behaviors for /api/* and /content/*", () => {
		template.hasResourceProperties("AWS::CloudFront::Distribution", {
			DistributionConfig: Match.objectLike({
				CacheBehaviors: Match.arrayWith([
					Match.objectLike({ PathPattern: "/api/*" }),
					Match.objectLike({ PathPattern: "/content/*" }),
				]),
			}),
		});
	});

	test("/api/* behavior has Lambda@Edge functions attached", () => {
		template.hasResourceProperties("AWS::CloudFront::Distribution", {
			DistributionConfig: Match.objectLike({
				CacheBehaviors: Match.arrayWith([
					Match.objectLike({
						PathPattern: "/api/*",
						LambdaFunctionAssociations: Match.arrayWith([
							Match.objectLike({ EventType: "origin-request" }),
							Match.objectLike({ EventType: "origin-response" }),
						]),
					}),
				]),
			}),
		});
	});

	test("/content/* behavior has Lambda@Edge functions attached", () => {
		template.hasResourceProperties("AWS::CloudFront::Distribution", {
			DistributionConfig: Match.objectLike({
				CacheBehaviors: Match.arrayWith([
					Match.objectLike({
						PathPattern: "/content/*",
						LambdaFunctionAssociations: Match.arrayWith([
							Match.objectLike({ EventType: "origin-request" }),
							Match.objectLike({ EventType: "origin-response" }),
						]),
					}),
				]),
			}),
		});
	});

	// ── Cache policy ──────────────────────────────────────────────────────────
	test("creates a no-cache policy with 0s TTL for payment routes", () => {
		template.hasResourceProperties("AWS::CloudFront::CachePolicy", {
			CachePolicyConfig: Match.objectLike({
				DefaultTTL: 0,
				MinTTL: 0,
				MaxTTL: 0,
			}),
		});
	});

	// ── Stack outputs ──────────────────────────────────────────────────────────
	test("outputs CloudFrontUrl", () => {
		template.hasOutput("CloudFrontUrl", {});
	});

	test("outputs ApiGatewayUrl", () => {
		template.hasOutput("ApiGatewayUrl", {});
	});

	// ── Tags ───────────────────────────────────────────────────────────────────
	test("stack has x402 project tags", () => {
		// Tags are applied via cdk.Tags.of(this) which propagates to all resources.
		// Verify at the Lambda function level as a representative resource.
		template.hasResourceProperties("AWS::Lambda::Function", {
			Tags: Match.arrayWith([
				Match.objectLike({ Key: "Project", Value: "x402-cloudfront-demo" }),
				Match.objectLike({ Key: "Protocol", Value: "x402" }),
			]),
		});
	});

	// ── Snapshot ───────────────────────────────────────────────────────────────
	test("matches snapshot", () => {
		expect(template.toJSON()).toMatchSnapshot();
	});
});
