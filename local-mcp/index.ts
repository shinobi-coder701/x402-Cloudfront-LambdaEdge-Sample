#!/usr/bin/env bun
/**
 * MCP config example (Claude Desktop):
 * {
 *   "mcpServers": {
 *     "x402-cloudfront-local": {
 *       "command": "bun",
 *       "args": ["run", "/path/to/x402-Cloudfront-LambdaEdge-Sample/local-mcp/index.ts"],
 *       "env": {
 *         "CLOUDFRONT_URL": "https://xxxx.cloudfront.net",
 *         "EVM_PRIVATE_KEY": "0x...",
 *         "SVM_PRIVATE_KEY": "..."
 *       }
 *     }
 *   }
 * }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import dotenv from "dotenv";
import events from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, erc20Abi, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { z } from "zod";

// Bun compatibility patch for @solana/rpc calling setMaxListeners with AbortSignal.
{
  const original = events.setMaxListeners.bind(events);
  events.setMaxListeners = (n: number, ...emitters: unknown[]) => {
    try {
      original(
        n,
        ...(emitters as Array<EventTarget | NodeJS.EventEmitter>),
      );
    } catch {
      // Ignore unsupported EventTarget/AbortSignal in Bun.
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as const;
const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com" as const;

const cloudfrontUrl = process.env.CLOUDFRONT_URL;
const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY;

function validateEndpoint(endpoint: string): string {
  if (!endpoint.startsWith("/")) {
    throw new Error("endpoint must start with '/'");
  }
  return endpoint;
}

function getTargetUrl(endpoint: string): string {
  if (!cloudfrontUrl || cloudfrontUrl.includes("XXXXX")) {
    throw new Error("CLOUDFRONT_URL is not configured");
  }
  return `${cloudfrontUrl}${validateEndpoint(endpoint)}`;
}

function parsePaymentRequirements(header: string): {
  network: string | null;
  payTo: string | null;
  asset: string | null;
  rawAmount: number;
  usdcAmount: string;
} {
  const requirements = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  const accept = requirements?.accepts?.[0] ?? {};
  const rawAmount = Number(accept.maxAmountRequired ?? accept.amount ?? 0);
  return {
    network: accept.network ?? null,
    payTo: accept.payTo ?? null,
    asset: accept.asset ?? null,
    rawAmount,
    usdcAmount: (rawAmount / 1_000_000).toFixed(6),
  };
}

function toPrettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function createEvmClient() {
  if (!evmPrivateKey || evmPrivateKey === "0x_YOUR_PRIVATE_KEY_HERE") {
    throw new Error("EVM_PRIVATE_KEY is not configured");
  }

  const signer = privateKeyToAccount(evmPrivateKey);
  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(signer));

  return { signer, client };
}

async function createSvmClient() {
  if (!svmPrivateKey || svmPrivateKey === "YOUR_SOLANA_PRIVATE_KEY_BASE58") {
    throw new Error("SVM_PRIVATE_KEY is not configured");
  }

  const keyBytes = base58.decode(svmPrivateKey);
  const signer = await createKeyPairSignerFromBytes(keyBytes);
  const client = new x402Client();
  client.register("solana:*", new ExactSvmScheme(signer));

  return { signer, client };
}

async function getEvmUsdcBalance(): Promise<number | null> {
  try {
    const { signer } = createEvmClient();
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });
    const balance = await publicClient.readContract({
      address: USDC_BASE_SEPOLIA,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [signer.address],
    });
    return Number(balance) / 1_000_000;
  } catch {
    return null;
  }
}

async function getSvmUsdcBalance(): Promise<number | null> {
  try {
    const { signer } = await createSvmClient();
    const response = await fetch(SOLANA_DEVNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          signer.address,
          { mint: USDC_DEVNET_MINT },
          { encoding: "jsonParsed" },
        ],
      }),
    });

    const json = (await response.json()) as {
      result?: {
        value?: Array<{
          account: {
            data: {
              parsed: {
                info: {
                  tokenAmount: { uiAmount: number | null };
                };
              };
            };
          };
        }>;
      };
    };

    const accounts = json.result?.value ?? [];
    if (accounts.length === 0) return 0;
    return accounts[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0;
  } catch {
    return null;
  }
}

async function fetchPaymentRequirements(endpoint: string) {
  const res = await fetch(getTargetUrl(endpoint));
  if (res.status !== 402) {
    throw new Error(`Expected 402, got ${res.status} ${res.statusText}`);
  }

  const paymentHeader =
    res.headers.get("payment-required") ??
    res.headers.get("x-payment-required");

  if (!paymentHeader) {
    throw new Error("payment-required header not found in 402 response");
  }

  return parsePaymentRequirements(paymentHeader);
}

async function generatePaymentSignatureEvm(endpoint: string): Promise<string> {
  const { client } = createEvmClient();
  const targetUrl = getTargetUrl(endpoint);

  let capturedSignature: string | null = null;

  const interceptFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const sig = headers["Payment-Signature"] ?? headers["payment-signature"] ?? null;

    if (sig) {
      capturedSignature = sig;
      return new Response(
        JSON.stringify({ captured: true, message: "Payload captured" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return fetch(input, init);
  };

  const fetchWithPayment = wrapFetchWithPayment(interceptFetch as typeof fetch, client);
  await fetchWithPayment(targetUrl);

  if (!capturedSignature) {
    throw new Error("Failed to generate Payment-Signature");
  }

  return capturedSignature;
}

async function generatePaymentSignatureSvm(endpoint: string): Promise<string> {
  const { client } = await createSvmClient();
  const targetUrl = getTargetUrl(endpoint);

  let capturedSignature: string | null = null;

  const interceptFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    let sig: string | null = null;
    if (input instanceof Request) {
      sig = input.headers.get("PAYMENT-SIGNATURE") ?? input.headers.get("X-PAYMENT");
    } else {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sig = headers["PAYMENT-SIGNATURE"] ?? headers["X-PAYMENT"] ?? null;
    }

    if (sig) {
      capturedSignature = sig;
      return new Response(
        JSON.stringify({ captured: true, message: "Payload captured" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return fetch(input, init);
  };

  const fetchWithPayment = wrapFetchWithPayment(interceptFetch as typeof fetch, client);
  await fetchWithPayment(targetUrl);

  if (!capturedSignature) {
    throw new Error("Failed to generate Payment-Signature");
  }

  return capturedSignature;
}

async function payEndpointEvm(endpoint: string): Promise<{
  status: number;
  statusText: string;
  body: string;
  balanceBefore: number | null;
  balanceAfter: number | null;
}> {
  const { client } = createEvmClient();
  const targetUrl = getTargetUrl(endpoint);

  const balanceBefore = await getEvmUsdcBalance();
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const response = await fetchWithPayment(targetUrl);
  const bodyText = await response.text();
  const balanceAfter = await getEvmUsdcBalance();

  return {
    status: response.status,
    statusText: response.statusText,
    body: toPrettyJson(bodyText),
    balanceBefore,
    balanceAfter,
  };
}

async function payEndpointSvm(endpoint: string): Promise<{
  status: number;
  statusText: string;
  body: string;
  balanceBefore: number | null;
  balanceAfter: number | null;
}> {
  const { client } = await createSvmClient();
  const targetUrl = getTargetUrl(endpoint);

  const balanceBefore = await getSvmUsdcBalance();
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const response = await fetchWithPayment(targetUrl);
  const bodyText = await response.text();
  const balanceAfter = await getSvmUsdcBalance();

  return {
    status: response.status,
    statusText: response.statusText,
    body: toPrettyJson(bodyText),
    balanceBefore,
    balanceAfter,
  };
}

const server = new McpServer({
  name: "x402-cloudfront-buyer-tools",
  version: "1.0.0",
});

server.tool(
  "x402_check_payment_requirements",
  "Check x402 payment requirements by triggering a 402 response from a paid endpoint.",
  {
    endpoint: z.string().describe("Endpoint path starting with '/'. Example: /api/hello"),
  },
  async ({ endpoint }) => {
    try {
      const requirements = await fetchPaymentRequirements(endpoint);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                endpoint,
                ...requirements,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "x402_get_usdc_balance_base_sepolia",
  "Get buyer wallet USDC balance on Base Sepolia.",
  {},
  async () => {
    const balance = await getEvmUsdcBalance();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              network: "eip155:84532",
              balanceUsdc: balance,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "x402_get_usdc_balance_solana_devnet",
  "Get buyer wallet USDC balance on Solana Devnet.",
  {},
  async () => {
    const balance = await getSvmUsdcBalance();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
              balanceUsdc: balance,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "x402_generate_payment_signature_evm",
  "Generate Payment-Signature for an endpoint on EVM without spending USDC.",
  {
    endpoint: z.string().describe("Endpoint path starting with '/'. Example: /api/hello"),
  },
  async ({ endpoint }) => {
    try {
      const signature = await generatePaymentSignatureEvm(endpoint);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                network: "eip155:84532",
                endpoint,
                paymentSignature: signature,
                note: "One-time use signature. Replay-protected.",
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "x402_generate_payment_signature_solana",
  "Generate Payment-Signature for an endpoint on Solana without spending USDC.",
  {
    endpoint: z.string().describe("Endpoint path starting with '/'. Example: /api/hello"),
  },
  async ({ endpoint }) => {
    try {
      const signature = await generatePaymentSignatureSvm(endpoint);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
                endpoint,
                paymentSignature: signature,
                note: "One-time use signature. Replay-protected.",
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "x402_pay_endpoint_evm",
  "⚠️ Spend real USDC on Base Sepolia and fetch paid endpoint response.",
  {
    endpoint: z.string().describe("Endpoint path starting with '/'. Example: /api/hello"),
  },
  async ({ endpoint }) => {
    try {
      const result = await payEndpointEvm(endpoint);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                network: "eip155:84532",
                endpoint,
                ...result,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "x402_pay_endpoint_solana",
  "⚠️ Spend real USDC on Solana Devnet and fetch paid endpoint response.",
  {
    endpoint: z.string().describe("Endpoint path starting with '/'. Example: /api/hello"),
  },
  async ({ endpoint }) => {
    try {
      const result = await payEndpointSvm(endpoint);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
                endpoint,
                ...result,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
