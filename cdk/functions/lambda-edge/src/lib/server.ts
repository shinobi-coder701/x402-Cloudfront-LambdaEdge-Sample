import type { FacilitatorConfig, RoutesConfig } from "@x402/core/server";
import {
	HTTPFacilitatorClient,
	x402HTTPResourceServer,
	x402ResourceServer,
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";

/**
 * Configuration for creating an x402 server
 */
export interface X402ServerConfig {
	/** Facilitator URL (e.g., 'https://x402.org/facilitator') */
	facilitatorUrl: string;
	/** EVM network ID (e.g., 'eip155:84532' for Base Sepolia) */
	network: string;
	/** Solana network ID (e.g., 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' for Devnet) */
	solanaNetwork: string;
	/** Route configuration defining which paths require payment */
	routes: RoutesConfig;
	/** Optional facilitator config with auth headers (for facilitators that require authentication) */
	facilitatorConfig?: FacilitatorConfig;
}

/**
 * Creates and initializes an x402HTTPResourceServer supporting both EVM and Solana payments.
 *
 * @example
 * ```typescript
 * // Testnet (Base Sepolia + Solana Devnet)
 * const server = await createX402Server({
 *   facilitatorUrl: 'https://x402.org/facilitator',
 *   network: 'eip155:84532',
 *   solanaNetwork: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
 *   routes: { ... },
 * });
 * ```
 */
export async function createX402Server(
	config: X402ServerConfig,
): Promise<x402HTTPResourceServer> {
	// ファシリテータークライアントを作成（testnet は同一エンドポイントで EVM / Solana 両対応）
	const facilitator = new HTTPFacilitatorClient(
		config.facilitatorConfig ?? { url: config.facilitatorUrl },
	);
	// EVM スキーム (ExactEvmScheme) と Solana スキーム (ExactSvmScheme) を両方登録
	const resourceServer = new x402ResourceServer(facilitator)
		.register(config.network as `${string}:${string}`, new ExactEvmScheme())
		.register(
			config.solanaNetwork as `${string}:${string}`,
			new ExactSvmScheme(),
		);
	// HTTPサーバーを作成し、初期化して準備完了
	const httpServer = new x402HTTPResourceServer(resourceServer, config.routes);
	await httpServer.initialize();

	return httpServer;
}
