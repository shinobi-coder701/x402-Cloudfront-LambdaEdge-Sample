import {
	GetSecretValueCommand,
	SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import bs58 from "bs58";
import { privateKeyToAccount } from "viem/accounts";

// 環境変数から CloudFront URL と秘密鍵の ARN を取得
const CLOUDFRONT_URL = process.env.CLOUDFRONT_URL!;
const EVM_SECRET_ARN = process.env.EVM_PRIVATE_KEY_SECRET_ARN!;
const SVM_SECRET_ARN = process.env.SVM_PRIVATE_KEY_SECRET_ARN!;

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
 * EVM (Base Sepolia) と Solana (Devnet) の両方を登録し、
 * x402 クライアントが 402 レスポンスの accepts から自動的に適切なスキームを選択する。
 * @returns ラップされた fetch 関数
 */
async function getPayFetch(): Promise<typeof fetch> {
	if (payFetch) return payFetch;

	const sm = new SecretsManagerClient({});

	// EVM 秘密鍵と Solana 秘密鍵を並行取得
	const [evmSecret, svmSecret] = await Promise.all([
		sm.send(new GetSecretValueCommand({ SecretId: EVM_SECRET_ARN })),
		sm.send(new GetSecretValueCommand({ SecretId: SVM_SECRET_ARN })),
	]);

	if (!evmSecret.SecretString) {
		throw new Error("EVM private key secret is empty");
	}
	if (!svmSecret.SecretString) {
		throw new Error("Solana private key secret is empty");
	}

	// EVM signer (viem)
	const evmSigner = privateKeyToAccount(
		evmSecret.SecretString as `0x${string}`,
	);

	// Solana signer (base58 encoded private key → ClientSvmSigner)
	const svmSigner = await createKeyPairSignerFromBytes(
		bs58.decode(svmSecret.SecretString),
	);

	// x402 クライアントに EVM と Solana の両スキームを登録
	const client = new x402Client();
	client.register("eip155:*", new ExactEvmScheme(evmSigner));
	client.register("solana:*", new ExactSvmScheme(svmSigner));

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
