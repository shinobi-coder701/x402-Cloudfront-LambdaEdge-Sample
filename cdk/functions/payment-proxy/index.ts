import {
	SecretsManagerClient,
	GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const CLOUDFRONT_URL = process.env.CLOUDFRONT_URL!;
const SECRET_ARN = process.env.EVM_PRIVATE_KEY_SECRET_ARN!;

// ルートマッピング: プロキシパス → CloudFront パス
const ROUTE_MAP: Record<string, string> = {
	"/proxy/hello": "/api/hello",
	"/proxy/premium": "/api/premium/data",
	"/proxy/article": "/content/article",
};

// Lambda ウォームアップ時に初期化（コールドスタート対策）
let payFetch: typeof fetch | null = null;

async function getPayFetch(): Promise<typeof fetch> {
	if (payFetch) return payFetch;

	const sm = new SecretsManagerClient({});
	const { SecretString } = await sm.send(
		new GetSecretValueCommand({ SecretId: SECRET_ARN }),
	);

	if (!SecretString) {
		throw new Error("EVM private key secret is empty");
	}

	const signer = privateKeyToAccount(SecretString as `0x${string}`);
	const client = new x402Client();
	client.register("eip155:*", new ExactEvmScheme(signer));
	payFetch = wrapFetchWithPayment(fetch, client);
	return payFetch;
}

export const handler = async (
	event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
	const proxyPath = event.path;
	const targetPath = ROUTE_MAP[proxyPath];

	if (!targetPath) {
		return {
			statusCode: 404,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ error: `Unknown proxy path: ${proxyPath}` }),
		};
	}

	let fetchFn: typeof fetch;
	try {
		fetchFn = await getPayFetch();
	} catch (err) {
		console.error("Failed to initialize payment client:", err);
		return {
			statusCode: 500,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ error: "Failed to initialize payment client" }),
		};
	}

	try {
		const res = await fetchFn(`${CLOUDFRONT_URL}${targetPath}`);
		const body = await res.text();
		return {
			statusCode: res.status,
			headers: { "Content-Type": "application/json" },
			body,
		};
	} catch (err) {
		console.error("Payment proxy request failed:", err);
		return {
			statusCode: 500,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ error: String(err) }),
		};
	}
};
