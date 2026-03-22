import {
	GetSecretValueCommand,
	SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { privateKeyToAccount } from "viem/accounts";

// 環境変数から CloudFront URL と EVM 秘密鍵の ARN を取得
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

/**
 * 支払いクライアントを初期化して fetch をラップする関数。
 * 初回呼び出し時に Secrets Manager から秘密鍵を取得し、以降はキャッシュされた fetch を返す。
 * @returns ラップされた fetch 関数
 */
async function getPayFetch(): Promise<typeof fetch> {
	if (payFetch) return payFetch;

	// Secrets Manager から EVM 秘密鍵を取得
	const sm = new SecretsManagerClient({});
	const { SecretString } = await sm.send(
		new GetSecretValueCommand({ SecretId: SECRET_ARN }),
	);

	if (!SecretString) {
		throw new Error("EVM private key secret is empty");
	}

	// 秘密鍵をアカウントに変換し、x402 クライアントを初期化して fetch をラップする
	const signer = privateKeyToAccount(SecretString as `0x${string}`);
	const client = new x402Client();
	// 支払いのためのSignerを登録（EIP-155対応のスキームを使用）
	client.register("eip155:*", new ExactEvmScheme(signer));
	// fetch を支払い対応にラップしてキャッシュ
	payFetch = wrapFetchWithPayment(fetch, client);
	return payFetch;
}

/**
 * Proxyハンドラーメソッド。
 * API Gateway からのリクエストを受け取り、対応する CloudFront のエンドポイントに転送する。
 * @param event
 * @returns
 */
export const handler = async (
	event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
	// リクエストされたパスに対応する CloudFront のパスを取得
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
		// 支払いクライアントを初期化して fetch を取得
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
		// リクエストされたパスに対応する CloudFront のエンドポイントにリクエストを転送
		const res = await fetchFn(`${CLOUDFRONT_URL}${targetPath}`);
		// CloudFront からのレスポンスをそのまま API Gateway のレスポンスとして返す
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
