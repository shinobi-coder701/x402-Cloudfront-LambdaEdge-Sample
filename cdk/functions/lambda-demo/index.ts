import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from "aws-lambda";

/**
 * Demo origin Lambda — simulates a content API protected by x402.
 *
 * Free endpoints:
 *   GET /          — Welcome page (no payment required)
 *
 * Paid endpoints (intercepted by Lambda@Edge before reaching here):
 *   GET /api/hello        — $0.001 USDC
 *   GET /api/premium/data — $0.01  USDC
 *   GET /content/article  — $0.005 USDC
 */
export const handler = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	const path = event.rawPath ?? "/";
	const method = event.requestContext.http.method;

	// CORS preflight
	if (method === "OPTIONS") {
		return cors(204, null);
	}

	if (path === "/" || path === "") {
		return cors(200, {
			message: "Welcome to the x402 Demo API!",
			description:
				"This API demonstrates x402 micropayments via CloudFront + Lambda@Edge.",
			endpoints: {
				free: [{ path: "/", description: "This welcome page" }],
				paid: [
					{
						path: "/api/hello",
						price: "$0.001 USDC",
						description: "Hello endpoint",
					},
					{
						path: "/api/premium/data",
						price: "$0.01 USDC",
						description: "Premium data endpoint",
					},
					{
						path: "/content/article",
						price: "$0.005 USDC",
						description: "Premium article",
					},
				],
			},
			network: "Base Sepolia (eip155:84532)",
			protocol: "x402 v2",
		});
	}

	if (path.startsWith("/api/hello")) {
		return cors(200, {
			message: "Hello from the paid endpoint!",
			data: {
				greeting: "You successfully paid $0.001 USDC to access this content.",
				timestamp: new Date().toISOString(),
				network: "Base Sepolia",
				protocol: "x402 v2",
			},
		});
	}

	if (path.startsWith("/api/premium")) {
		return cors(200, {
			message: "Premium data access granted!",
			data: {
				insight: "This is exclusive premium content worth $0.01 USDC.",
				metrics: {
					value: 42,
					trend: "up",
					confidence: 0.95,
				},
				timestamp: new Date().toISOString(),
			},
		});
	}

	if (path.startsWith("/content/article")) {
		return cors(200, {
			title: "The Future of AI Micropayments",
			content:
				"x402 enables AI agents to autonomously pay for APIs using USDC on Base. " +
				"No accounts, no API keys — just cryptographic payment proofs verified on-chain.",
			author: "x402 Demo",
			publishedAt: "2026-01-01",
			readTime: "2 min",
		});
	}

	return cors(404, { error: "Not Found", path });
};

/**
 * 共通のCORSヘッダーを含むレスポンスを生成するユーティリティ関数。
 * @param statusCode HTTPステータスコード
 * @param body レスポンスボディ
 * @returns APIGatewayProxyResultV2
 */
function cors(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
	return {
		statusCode,
		headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers":
				"Content-Type,Payment-Signature,X-Payment-Response",
			"Access-Control-Allow-Methods": "GET,OPTIONS",
		},
		body: body !== null ? JSON.stringify(body) : undefined,
	};
}
