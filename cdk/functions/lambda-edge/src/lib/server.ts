import type { FacilitatorConfig, RoutesConfig } from "@x402/core/server";
import {
	HTTPFacilitatorClient,
	x402HTTPResourceServer,
	x402ResourceServer,
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

/**
 * Configuration for creating an x402 server
 */
export interface X402ServerConfig {
	/** Facilitator URL (e.g., 'https://x402.org/facilitator') */
	facilitatorUrl: string;
	/** Network ID (e.g., 'eip155:84532' for Base Sepolia) */
	network: string;
	/** Route configuration defining which paths require payment */
	routes: RoutesConfig;
	/** Optional facilitator config with auth headers (for facilitators that require authentication) */
	facilitatorConfig?: FacilitatorConfig;
}

/**
 * Creates and initializes an x402HTTPResourceServer.
 *
 * @example
 * ```typescript
 * // Testnet (no auth)
 * const server = await createX402Server({
 *   facilitatorUrl: 'https://x402.org/facilitator',
 *   network: 'eip155:84532',
 *   routes: { ... },
 * });
 *
 * // Mainnet with auth (pass a facilitator config from your facilitator package)
 * const server = await createX402Server({
 *   facilitatorUrl: 'https://your-facilitator-url',
 *   network: 'eip155:8453',
 *   routes: { ... },
 *   facilitatorConfig: createFacilitatorConfig('api-key-id', 'api-key-secret'),
 * });
 * ```
 */
export async function createX402Server(
	config: X402ServerConfig,
): Promise<x402HTTPResourceServer> {
	// ファシリテータークライアントを作成（認証が必要な場合はfacilitatorConfigを使用）
	const facilitator = new HTTPFacilitatorClient(
		config.facilitatorConfig ?? { url: config.facilitatorUrl },
	);
	// リソースサーバーインスタンスを作成し、指定されたネットワークとスキームでルートを登録
	const resourceServer = new x402ResourceServer(facilitator).register(
		config.network as `${string}:${string}`,
		new ExactEvmScheme(),
	);
	// HTTPサーバーを作成し、初期化して準備完了
	const httpServer = new x402HTTPResourceServer(resourceServer, config.routes);
	await httpServer.initialize();

	return httpServer;
}
