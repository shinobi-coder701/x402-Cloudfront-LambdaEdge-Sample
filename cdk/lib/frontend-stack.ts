import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import * as path from "path";

export interface FrontendStackProps extends cdk.StackProps {
	/** Strands Agent API URL from StrandsAgentStack */
	strandsAgentApiUrl: string;
}

/**
 * Phase 7: FrontendStack
 *
 * React/Vite フロントエンドを CloudFront + S3 で配信する。
 * - ビルド済み dist/ を S3 に配置
 * - ランタイム設定 (config.json) を S3 に配置
 *   → React アプリが起動時に fetch('/config.json') で取得
 * - SPA ルーティング対応 (403/404 → index.html)
 */
export class FrontendStack extends cdk.Stack {
	public readonly frontendUrl: string;

	/**
	 * コンストラクター
	 * @param scope
	 * @param id
	 * @param props
	 */
	constructor(scope: Construct, id: string, props: FrontendStackProps) {
		super(scope, id, props);

		// S3 バケット（パブリックアクセス全遮断）
		const bucket = new s3.Bucket(this, "FrontendBucket", {
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			encryption: s3.BucketEncryption.S3_MANAGED,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
		});

		// CloudFront OAC（OAI の後継）
		const oac = new cloudfront.S3OriginAccessControl(this, "FrontendOAC");

		// CloudFront ディストリビューション
		const distribution = new cloudfront.Distribution(
			this,
			"FrontendDistribution",
			{
				comment: "x402 Demo — React frontend",
				defaultBehavior: {
					origin: origins.S3BucketOrigin.withOriginAccessControl(bucket, {
						originAccessControl: oac,
					}),
					viewerProtocolPolicy:
						cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
					cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
					compress: true,
				},
				defaultRootObject: "index.html",
				// SPA ルーティング対応: 403/404 → index.html にフォールバック
				errorResponses: [
					{
						httpStatus: 403,
						responseHttpStatus: 200,
						responsePagePath: "/index.html",
						ttl: cdk.Duration.seconds(0),
					},
					{
						httpStatus: 404,
						responseHttpStatus: 200,
						responsePagePath: "/index.html",
						ttl: cdk.Duration.seconds(0),
					},
				],
			},
		);

		// ビルド済みフロントエンド + ランタイム設定 (config.json) を1回で S3 に配置
		// ※ sources に複数指定すると zip をマージしてアップロードされる
		// ※ BucketDeployment を分割すると実行順序不定により一方が他のファイルを
		//    prune してしまうため、必ず1つの BucketDeployment にまとめること
		new s3deploy.BucketDeployment(this, "DeployFrontend", {
			sources: [
				s3deploy.Source.asset(path.join(__dirname, "../../frontend/dist")),
				s3deploy.Source.jsonData("config.json", {
					strandsAgentApiUrl: props.strandsAgentApiUrl,
				}),
			],
			destinationBucket: bucket,
			distribution,
			distributionPaths: ["/*"],
		});

		this.frontendUrl = `https://${distribution.distributionDomainName}`;

		// ===========================================================================
		// 成果物
		// ===========================================================================

		new cdk.CfnOutput(this, "FrontendUrl", {
			value: this.frontendUrl,
			description: "React フロントエンドの CloudFront URL",
		});
	}
}
