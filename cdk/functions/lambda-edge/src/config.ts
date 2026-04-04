/**
 * x402 Configuration
 *
 * Values are injected at bundle time via esbuild --define flags by the CDK stack.
 * Lambda@Edge does NOT support environment variables, so config is baked in at build time.
 *
 * Set the following environment variables before running `cdk deploy`:
 *   PAY_TO_ADDRESS      — EVM wallet address to receive payments (required)
 *   SVM_PAY_TO_ADDRESS  — Solana wallet address to receive payments (required)
 *   X402_NETWORK        — CAIP-2 EVM network ID (default: eip155:84532 = Base Sepolia)
 *   SOLANA_NETWORK      — CAIP-2 Solana network ID (default: solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1 = Devnet)
 *   FACILITATOR_URL     — x402 facilitator URL (default: https://x402.org/facilitator)
 */

import type { RoutesConfig } from "@x402/core/server";

// These constants are replaced by esbuild --define at bundle time.
// CDK reads the env vars at synth time and injects the values here.
declare const __PAY_TO_ADDRESS__: string;
declare const __SVM_PAY_TO_ADDRESS__: string;
declare const __X402_NETWORK__: string;
declare const __SOLANA_NETWORK__: string;
declare const __FACILITATOR_URL__: string;

export const FACILITATOR_URL: string = __FACILITATOR_URL__;
export const PAY_TO: string = __PAY_TO_ADDRESS__;
export const SVM_PAY_TO: string = __SVM_PAY_TO_ADDRESS__;
export const NETWORK: string = __X402_NETWORK__;
export const SOLANA_NETWORK: string = __SOLANA_NETWORK__;

// Route configuration — which paths require payment and at what price.
// Each route accepts both EVM (Base Sepolia) and Solana (Devnet) payments.
export const ROUTES: RoutesConfig = {
	"/api/*": {
		accepts: [
			{
				scheme: "exact",
				network: NETWORK,
				payTo: PAY_TO,
				price: "$0.001",
			},
			{
				scheme: "exact",
				network: SOLANA_NETWORK,
				payTo: SVM_PAY_TO,
				price: "$0.001",
			},
		],
		description: "API access ($0.001 USDC)",
	},
	"/api/premium/**": {
		accepts: [
			{
				scheme: "exact",
				network: NETWORK,
				payTo: PAY_TO,
				price: "$0.01",
			},
			{
				scheme: "exact",
				network: SOLANA_NETWORK,
				payTo: SVM_PAY_TO,
				price: "$0.01",
			},
		],
		description: "Premium API access ($0.01 USDC)",
	},
	"/content/**": {
		accepts: [
			{
				scheme: "exact",
				network: NETWORK,
				payTo: PAY_TO,
				price: "$0.005",
			},
			{
				scheme: "exact",
				network: SOLANA_NETWORK,
				payTo: SVM_PAY_TO,
				price: "$0.005",
			},
		],
		description: "Premium content ($0.005 USDC)",
	},
};
