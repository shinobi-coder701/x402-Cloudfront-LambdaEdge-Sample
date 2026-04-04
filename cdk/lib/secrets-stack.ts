import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

/**
 * Phase 1: SecretsStack
 * EVM / Solana 両方の秘密鍵を SecretsManager に安全に保管する。
 *
 * デプロイ後、CLI で実際の値をセットする:
 *   aws secretsmanager put-secret-value \
 *     --secret-id x402/evm-private-key \
 *     --secret-string "0xYOUR_EVM_PRIVATE_KEY"
 *
 *   aws secretsmanager put-secret-value \
 *     --secret-id x402/svm-private-key \
 *     --secret-string "YOUR_SOLANA_PRIVATE_KEY_BASE58"
 */
export class SecretsStack extends cdk.Stack {
	public readonly evmPrivateKeySecret: secretsmanager.ISecret;
	public readonly svmPrivateKeySecret: secretsmanager.ISecret;

	/**
	 * コンストラクター
	 * @param scope
	 * @param id
	 * @param props
	 */
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		this.evmPrivateKeySecret = new secretsmanager.Secret(
			this,
			"EvmPrivateKey",
			{
				secretName: "x402/evm-private-key",
				description:
					"EVM private key for x402 payment signing (Base Sepolia testnet)",
			},
		);

		this.svmPrivateKeySecret = new secretsmanager.Secret(
			this,
			"SvmPrivateKey",
			{
				secretName: "x402/svm-private-key",
				description:
					"Solana private key for x402 payment signing (base58, Solana Devnet)",
			},
		);

		// ===========================================================================
		// 成果物
		// ===========================================================================

		new cdk.CfnOutput(this, "EvmSecretArn", {
			value: this.evmPrivateKeySecret.secretArn,
			exportName: "X402EvmPrivateKeySecretArn",
			description: "ARN of the EVM private key secret for x402 payment signing",
		});

		new cdk.CfnOutput(this, "SvmSecretArn", {
			value: this.svmPrivateKeySecret.secretArn,
			exportName: "X402SvmPrivateKeySecretArn",
			description:
				"ARN of the Solana private key secret for x402 payment signing",
		});
	}
}
