import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

/**
 * Phase 1: SecretsStack
 * EVM private key を SecretsManager に安全に保管する。
 * デプロイ後、CLI で実際の値をセットする:
 *   aws secretsmanager put-secret-value \
 *     --secret-id x402/evm-private-key \
 *     --secret-string "0xYOUR_EVM_PRIVATE_KEY"
 */
export class SecretsStack extends cdk.Stack {
	public readonly evmPrivateKeySecret: secretsmanager.ISecret;

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

		new cdk.CfnOutput(this, "SecretArn", {
			value: this.evmPrivateKeySecret.secretArn,
			exportName: "X402EvmPrivateKeySecretArn",
			description: "ARN of the EVM private key secret for x402 payment signing",
		});
	}
}
