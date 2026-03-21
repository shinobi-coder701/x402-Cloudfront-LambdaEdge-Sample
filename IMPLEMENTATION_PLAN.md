# 実装計画: Bedrock AgentCore × Strands Agent × x402 via MCP

> 作成日: 2026-03-21

---

## 全体アーキテクチャ

```bash
[FrontendStack]  CloudFront (S3) ← React/Vite UI
                     ↓ fetch POST /invoke
[StrandsAgentStack] API GW → Strands Agent Lambda (Python)
                                ↓ MCP protocol (HTTP/SSE)
[AgentCoreGatewayStack]  AgentCore Gateway (MCP Server)
                                ↓ HTTP call
[PaymentProxyStack]  API GW → Payment Proxy Lambda (TypeScript)
                                ↓ x402 flow: 402 → sign → retry
[CdkStack (既存)]   CloudFront → Lambda@Edge → API GW → Demo Lambda
```

**設計のポイント:**
- **Payment Proxy Lambda** が x402 の3ステップフロー（402受信 → 署名 → リトライ）を内部で完結させる
- **AgentCore Gateway** はこの Proxy を HTTP ターゲットとして設定し、MCP ツールとして公開
- **Strands Agent** は MCP プロトコル経由でツールを呼ぶだけ。x402 を意識しない
- x402 のコア（Lambda@Edge）は変更不要

---

## CDK スタック構成

```
cdk/
├── bin/
│   └── cdk.ts                           # 更新: 全スタック追加
├── lib/
│   ├── cdk-stack.ts                     # 既存 (cloudFrontUrl property 追加)
│   ├── secrets-stack.ts                 # 新規: SecretsManager
│   ├── payment-proxy-stack.ts           # 新規: x402 プロキシ Lambda + API GW
│   ├── agent-core-gateway-stack.ts      # 新規: AgentCore Gateway (MCP server)
│   ├── strands-agent-stack.ts           # 新規: Strands Agent Lambda + API GW
│   └── frontend-stack.ts               # 新規: CloudFront + S3 フロントエンド配信
├── functions/
│   ├── lambda-edge/                     # 既存
│   ├── lambda-demo/                     # 既存
│   ├── payment-proxy/                   # 新規: TypeScript
│   │   ├── index.ts
│   │   └── package.json
│   └── strands-agent/                   # 新規: Python
│       ├── agent.py
│       └── requirements.txt
└── openapi/
    └── payment-proxy-api.yaml           # 新規: AgentCore Gateway 用 OpenAPI spec
```

---

## スタック依存関係

```
SecretsStack ──────────────────────────────┐
                                           ↓
CdkStack (既存) ──────────────────→ PaymentProxyStack
                                           ↓
                              AgentCoreGatewayStack
                                           ↓
                               StrandsAgentStack
                                           ↓
                                FrontendStack
```

---

## Phase 1: `SecretsStack` (新規)

**ファイル:** `cdk/lib/secrets-stack.ts`

```typescript
export class SecretsStack extends cdk.Stack {
  public readonly evmPrivateKeySecret: secretsmanager.ISecret;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.evmPrivateKeySecret = new secretsmanager.Secret(this, 'EvmPrivateKey', {
      secretName: 'x402/evm-private-key',
      description: 'EVM private key for x402 payment signing (Base Sepolia testnet)',
    });

    new cdk.CfnOutput(this, 'SecretArn', {
      value: this.evmPrivateKeySecret.secretArn,
      exportName: 'X402EvmPrivateKeySecretArn',
    });
  }
}
```

**デプロイ後の作業:** AWS Console または CLI でシークレット値を設定

```bash
aws secretsmanager put-secret-value \
  --secret-id x402/evm-private-key \
  --secret-string "0xYOUR_EVM_PRIVATE_KEY"
```

---

## Phase 2: `CdkStack` 既存スタック修正

**ファイル:** `cdk/lib/cdk-stack.ts`

`cloudFrontUrl` を public property として公開（クロススタック参照用）:

```typescript
export class CdkStack extends cdk.Stack {
  public readonly cloudFrontUrl: string;  // 追加

  // ...既存コード...

  // constructor 内で distribution 作成後:
  this.cloudFrontUrl = `https://${distribution.distributionDomainName}`;
}
```

---

## Phase 3: `PaymentProxyStack` (新規)

x402 の支払いフローを内部で処理する Proxy レイヤー。

### Lambda 関数

**ファイル:** `cdk/functions/payment-proxy/index.ts`

```typescript
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const CLOUDFRONT_URL = process.env.CLOUDFRONT_URL!;
const SECRET_ARN = process.env.EVM_PRIVATE_KEY_SECRET_ARN!;

// ルートマッピング: プロキシパス → CloudFront パス
const ROUTE_MAP: Record<string, string> = {
  "/proxy/hello":   "/api/hello",
  "/proxy/premium": "/api/premium/data",
  "/proxy/article": "/content/article",
};

// Lambda ウォームアップ時に初期化（コールドスタート対策）
let payFetch: typeof fetch | null = null;

async function getPayFetch(): Promise<typeof fetch> {
  if (payFetch) return payFetch;

  const sm = new SecretsManagerClient({});
  const { SecretString } = await sm.send(
    new GetSecretValueCommand({ SecretId: SECRET_ARN })
  );

  const signer = privateKeyToAccount(SecretString as `0x${string}`);
  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(signer));
  payFetch = wrapFetchWithPayment(fetch, client);
  return payFetch;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const proxyPath = event.path;
  const targetPath = ROUTE_MAP[proxyPath];

  if (!targetPath) {
    return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
  }

  const fetchFn = await getPayFetch();

  try {
    const res = await fetchFn(`${CLOUDFRONT_URL}${targetPath}`);
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: { "Content-Type": "application/json" },
      body,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
```

**ファイル:** `cdk/functions/payment-proxy/package.json`

```json
{
  "name": "payment-proxy",
  "version": "1.0.0",
  "dependencies": {
    "@x402/core": "2.2.0",
    "@x402/evm": "2.2.0",
    "@x402/fetch": "2.2.0",
    "viem": "^2.0.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.159",
    "esbuild": "^0.27.2",
    "typescript": "^5.9.3"
  }
}
```

### CDK スタック定義

**ファイル:** `cdk/lib/payment-proxy-stack.ts`

```typescript
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as path from "path";
import { Construct } from "constructs";

export interface PaymentProxyStackProps extends cdk.StackProps {
  cloudFrontUrl: string;
  evmPrivateKeySecret: secretsmanager.ISecret;
}

export class PaymentProxyStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: PaymentProxyStackProps) {
    super(scope, id, props);

    const fn = new nodejs.NodejsFunction(this, 'PaymentProxy', {
      entry: path.join(__dirname, '../functions/payment-proxy/index.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        CLOUDFRONT_URL: props.cloudFrontUrl,
        EVM_PRIVATE_KEY_SECRET_ARN: props.evmPrivateKeySecret.secretArn,
      },
    });

    props.evmPrivateKeySecret.grantRead(fn);

    const api = new apigw.LambdaRestApi(this, 'PaymentProxyApi', {
      handler: fn,
      proxy: true,
    });

    this.apiUrl = api.url;
    new cdk.CfnOutput(this, 'PaymentProxyApiUrl', { value: this.apiUrl });
  }
}
```

---

## Phase 4: `AgentCoreGatewayStack` (新規)

AgentCore Gateway を MCP サーバーとして設定。

### OpenAPI Spec

**ファイル:** `cdk/openapi/payment-proxy-api.yaml`

```yaml
openapi: "3.0.1"
info:
  title: "x402 Payment Proxy API"
  version: "1.0.0"
  description: "MCP tools for accessing x402-protected content"
paths:
  /proxy/hello:
    get:
      operationId: "getHelloContent"
      description: "Get hello content (costs $0.001 USDC on Base Sepolia)"
      responses:
        "200":
          description: "Success"
          content:
            application/json:
              schema:
                type: object
  /proxy/premium:
    get:
      operationId: "getPremiumData"
      description: "Get premium analytics data (costs $0.01 USDC on Base Sepolia)"
      responses:
        "200":
          description: "Success"
          content:
            application/json:
              schema:
                type: object
  /proxy/article:
    get:
      operationId: "getArticleContent"
      description: "Get article content (costs $0.005 USDC on Base Sepolia)"
      responses:
        "200":
          description: "Success"
          content:
            application/json:
              schema:
                type: object
```

### CDK スタック定義

**ファイル:** `cdk/lib/agent-core-gateway-stack.ts`

```typescript
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import { Construct } from "constructs";

export interface AgentCoreGatewayStackProps extends cdk.StackProps {
  paymentProxyApiUrl: string;
}

export class AgentCoreGatewayStack extends cdk.Stack {
  public readonly gatewayArn: string;
  public readonly mcpEndpointUrl: string;

  constructor(scope: Construct, id: string, props: AgentCoreGatewayStackProps) {
    super(scope, id, props);

    // Gateway 実行ロール
    const gatewayRole = new iam.Role(this, 'GatewayRole', {
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'AgentCore Gateway execution role for x402 payment proxy',
    });

    // OpenAPI spec を S3 Asset として管理
    const openApiSpec = new s3assets.Asset(this, 'OpenApiSpec', {
      path: path.join(__dirname, '../openapi/payment-proxy-api.yaml'),
    });
    openApiSpec.grantRead(gatewayRole);

    // AgentCore Gateway (L1 construct)
    // NOTE: AWS::BedrockAgentCore::Gateway のリソース名は GA 時に変わる可能性あり
    const gateway = new cdk.CfnResource(this, 'X402Gateway', {
      type: 'AWS::BedrockAgentCore::Gateway',
      properties: {
        GatewayName: 'x402-payment-gateway',
        Description: 'MCP server wrapping x402-protected CloudFront content',
        RoleArn: gatewayRole.roleArn,
        ProtocolConfiguration: {
          McpConfiguration: {
            Enabled: true,
          },
        },
        GatewayTargets: [{
          HttpGatewayTarget: {
            Uri: props.paymentProxyApiUrl,
          },
          OpenApiSpec: {
            S3: {
              Bucket: openApiSpec.s3BucketName,
              Key: openApiSpec.s3ObjectKey,
            },
          },
        }],
      },
    });

    this.gatewayArn = gateway.getAtt('GatewayArn').toString();
    this.mcpEndpointUrl = gateway.getAtt('GatewayEndpointUrl').toString();

    new cdk.CfnOutput(this, 'GatewayArn', { value: this.gatewayArn });
    new cdk.CfnOutput(this, 'McpEndpointUrl', { value: this.mcpEndpointUrl });
  }
}
```

---

## Phase 5: `StrandsAgentStack` (新規)

### Strands Agent (Python Lambda)

**ファイル:** `cdk/functions/strands-agent/agent.py`

```python
import os
import json
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient

GATEWAY_MCP_URL = os.environ["AGENT_CORE_GATEWAY_MCP_URL"]
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-6-20251101-v1:0",
    region_name=AWS_REGION,
)

# AgentCore Gateway に MCP クライアントとして接続
mcp_client = MCPClient(server_url=GATEWAY_MCP_URL)

agent = Agent(
    model=model,
    tools=[*mcp_client.get_tools()],
    system_prompt="""You are an AI assistant that can access x402-protected premium content.
You have access to the following tools via MCP:
- getHelloContent: Fetch hello content (auto-pays $0.001 USDC)
- getPremiumData: Fetch premium analytics (auto-pays $0.01 USDC)
- getArticleContent: Fetch article content (auto-pays $0.005 USDC)

Payment for each tool call is handled automatically. Always inform the user
what content was accessed and summarize the results clearly.""",
)

def handler(event, context):
    body = json.loads(event.get("body", "{}"))
    user_message = body.get("message", "")
    session_id = body.get("session_id", "default")

    if not user_message:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "message is required"}),
        }

    response = agent(user_message)

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "session_id": session_id,
            "response": str(response),
        }),
    }
```

**ファイル:** `cdk/functions/strands-agent/requirements.txt`

```
strands-agents>=0.1.0
boto3>=1.35.0
```

### CDK スタック定義

**ファイル:** `cdk/lib/strands-agent-stack.ts`

```typescript
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as python from "@aws-cdk/aws-lambda-python-alpha";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import { Construct } from "constructs";

export interface StrandsAgentStackProps extends cdk.StackProps {
  mcpEndpointUrl: string;
}

export class StrandsAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StrandsAgentStackProps) {
    super(scope, id, props);

    const fn = new python.PythonFunction(this, 'StrandsAgent', {
      entry: path.join(__dirname, '../functions/strands-agent'),
      runtime: lambda.Runtime.PYTHON_3_12,
      memorySize: 1024,
      timeout: cdk.Duration.minutes(5),
      environment: {
        AGENT_CORE_GATEWAY_MCP_URL: props.mcpEndpointUrl,
      },
    });

    // Bedrock モデル呼び出し権限
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        'arn:aws:bedrock:*::foundation-model/anthropic.claude-*',
        'arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-*',
      ],
    }));

    // AgentCore Gateway 呼び出し権限
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:InvokeGateway'],
      resources: ['*'], // Gateway ARN が確定後に絞り込む
    }));

    const api = new apigw.LambdaRestApi(this, 'StrandsAgentApi', {
      handler: fn,
      proxy: true,
    });

    new cdk.CfnOutput(this, 'StrandsAgentApiUrl', { value: api.url });
  }
}
```

---

## Phase 6: `bin/cdk.ts` 更新

```typescript
import * as cdk from "aws-cdk-lib";
import { CdkStack } from "../lib/cdk-stack";
import { SecretsStack } from "../lib/secrets-stack";
import { PaymentProxyStack } from "../lib/payment-proxy-stack";
import { AgentCoreGatewayStack } from "../lib/agent-core-gateway-stack";
import { StrandsAgentStack } from "../lib/strands-agent-stack";

const app = new cdk.App();
const env = { region: "us-east-1" };

// Stack 1: 既存 (Lambda@Edge のため us-east-1 固定)
const cdkStack = new CdkStack(app, "CdkStack", { env });

// Stack 2: Secrets Manager
const secretsStack = new SecretsStack(app, "SecretsStack", { env });

// Stack 3: Payment Proxy
const paymentProxyStack = new PaymentProxyStack(app, "PaymentProxyStack", {
  cloudFrontUrl: cdkStack.cloudFrontUrl,
  evmPrivateKeySecret: secretsStack.evmPrivateKeySecret,
  env,
});

// Stack 4: AgentCore Gateway (MCP Server)
const agentCoreGatewayStack = new AgentCoreGatewayStack(app, "AgentCoreGatewayStack", {
  paymentProxyApiUrl: paymentProxyStack.apiUrl,
  env,
});

// Stack 5: Strands Agent
new StrandsAgentStack(app, "StrandsAgentStack", {
  mcpEndpointUrl: agentCoreGatewayStack.mcpEndpointUrl,
  env,
});
```

---

## Phase 7: `FrontendStack` (新規) — React/Vite UI

### デザインコンセプト: "Neon Noir Payment Terminal"

x402 の「AIが自律的に支払いを行う」というコンセプトを体現する UI。
暗号資産の無機質さと AI エージェントの知性を融合した、ターミナル×ラグジュアリーの美学。

| 要素 | 選択 | 理由 |
|------|------|------|
| **背景** | `#080B14`（深紺/ほぼ黒） | 金融端末・ブルームバーグ端末感 |
| **x402 支払い色** | `#00E5CC`（電気ティール） | 送金成功の「通電」感 |
| **USDC 金額色** | `#F5A623`（アンバー/金） | 暗号資産のゴールド感 |
| **AI / Agent 色** | `#8B5CF6`（パープル） | 知性・AIの象徴色 |
| **表示フォント** | `Sora` (Google Fonts) | 現代的・ジオメトリック |
| **等幅フォント** | `JetBrains Mono` | アドレス・ハッシュ表示 |
| **レイアウト** | 左: チャット / 右: 支払い台帳 | 操作と結果を同時表示 |
| **アニメーション** | framer-motion | カード登場・メッセージフェード |

---

### フロントエンド ディレクトリ構成

```
frontend/src/
├── components/
│   ├── ChatPanel.tsx         # 左ペイン: Strands Agent との会話 UI
│   ├── MessageBubble.tsx     # チャットメッセージ（user / agent）
│   ├── PaymentLedger.tsx     # 右ペイン: x402 支払い台帳
│   ├── PaymentCard.tsx       # 支払いトランザクション 1 件
│   ├── ToolBadge.tsx         # 呼び出された MCP ツール + 価格バッジ
│   ├── StatusBar.tsx         # 上部: 接続状態・ネットワーク情報
│   └── ThinkingDots.tsx      # Agent 思考中アニメーション
├── hooks/
│   └── useAgent.ts           # Strands Agent API 呼び出し + セッション管理
├── lib/
│   └── config.ts             # ランタイム config.json ローダー
├── types/
│   └── index.ts              # 共有型定義
├── App.tsx                   # メインレイアウト（更新）
├── App.css                   # CSS 変数・グローバルスタイル
└── main.tsx                  # エントリーポイント
```

---

### 追加パッケージ

```bash
cd frontend
bun add framer-motion @tanstack/react-query axios
bun add -d @types/node
```

`index.html` に Google Fonts を追加:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

### ランタイム設定注入の仕組み

Vite の `VITE_` 環境変数はビルド時に埋め込まれるため、API URL が変わるたびに再ビルドが必要になる。
CDK から `/config.json` を S3 に書き込む方式を採用し、**フロントエンドは起動時に fetch して取得**する。

```
FrontendStack (CDK)
  └── s3deploy.Source.jsonData('config.json', { strandsAgentApiUrl })
        ↓ S3 に配置
React App (起動時)
  └── fetch('/config.json') → API URL を取得
```

**ファイル:** `frontend/src/lib/config.ts`

```typescript
export interface AppConfig {
  strandsAgentApiUrl: string;
}

let _config: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (_config) return _config;
  const res = await fetch('/config.json');
  if (!res.ok) throw new Error('Failed to load config.json');
  _config = await res.json();
  return _config!;
}
```

---

### Agent API フック

**ファイル:** `frontend/src/hooks/useAgent.ts`

```typescript
import { useState, useCallback, useRef } from 'react';
import { loadConfig } from '../lib/config';

export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  toolUsed?: string;   // 呼び出された MCP ツール名
  paymentUsdc?: string; // 支払い金額（例: "0.001"）
}

export interface PaymentRecord {
  id: string;
  tool: string;
  amountUsdc: string;
  timestamp: Date;
  status: 'pending' | 'confirmed';
}

export function useAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const sessionId = useRef(crypto.randomUUID());

  const sendMessage = useCallback(async (text: string) => {
    const config = await loadConfig();

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch(`${config.strandsAgentApiUrl}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId.current }),
      });
      const data = await res.json();

      const agentMsg: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: data.response,
        timestamp: new Date(),
        toolUsed: data.tool_used,
        paymentUsdc: data.payment_usdc,
      };
      setMessages((prev) => [...prev, agentMsg]);

      // 支払いが発生した場合は台帳に追加
      if (data.tool_used && data.payment_usdc) {
        setPayments((prev) => [
          {
            id: crypto.randomUUID(),
            tool: data.tool_used,
            amountUsdc: data.payment_usdc,
            timestamp: new Date(),
            status: 'confirmed',
          },
          ...prev,
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { messages, payments, isLoading, sendMessage };
}
```

---

### CDK スタック定義

**ファイル:** `cdk/lib/frontend-stack.ts`

```typescript
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as path from "path";
import { Construct } from "constructs";

export interface FrontendStackProps extends cdk.StackProps {
  strandsAgentApiUrl: string;
}

export class FrontendStack extends cdk.Stack {
  public readonly frontendUrl: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // S3 バケット（パブリックアクセス全遮断）
    const bucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront OAC（OAI の後継）
    const oac = new cloudfront.S3OriginAccessControl(this, "FrontendOAC");

    // CloudFront ディストリビューション
    const distribution = new cloudfront.Distribution(this, "FrontendDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      defaultRootObject: "index.html",
      // SPA ルーティング対応: 403/404 → index.html にフォールバック
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // ビルド済みフロントエンドを S3 に配置
    new s3deploy.BucketDeployment(this, "DeployFrontend", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../frontend/dist")),
      ],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
    });

    // ランタイム設定を config.json として S3 に配置
    // → React アプリが起動時に fetch('/config.json') で取得する
    new s3deploy.BucketDeployment(this, "DeployConfig", {
      sources: [
        s3deploy.Source.jsonData("config.json", {
          strandsAgentApiUrl: props.strandsAgentApiUrl,
        }),
      ],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/config.json"],
    });

    this.frontendUrl = `https://${distribution.distributionDomainName}`;

    new cdk.CfnOutput(this, "FrontendUrl", {
      value: this.frontendUrl,
      description: "React フロントエンドの CloudFront URL",
    });
  }
}
```

---

## Phase 8: `bin/cdk.ts` 最終更新（FrontendStack 追加）

```typescript
import * as cdk from "aws-cdk-lib";
import { CdkStack } from "../lib/cdk-stack";
import { SecretsStack } from "../lib/secrets-stack";
import { PaymentProxyStack } from "../lib/payment-proxy-stack";
import { AgentCoreGatewayStack } from "../lib/agent-core-gateway-stack";
import { StrandsAgentStack } from "../lib/strands-agent-stack";
import { FrontendStack } from "../lib/frontend-stack";

const app = new cdk.App();
const env = { region: "us-east-1" };

// Stack 1: 既存 (Lambda@Edge のため us-east-1 固定)
const cdkStack = new CdkStack(app, "CdkStack", { env });

// Stack 2: Secrets Manager
const secretsStack = new SecretsStack(app, "SecretsStack", { env });

// Stack 3: Payment Proxy
const paymentProxyStack = new PaymentProxyStack(app, "PaymentProxyStack", {
  cloudFrontUrl: cdkStack.cloudFrontUrl,
  evmPrivateKeySecret: secretsStack.evmPrivateKeySecret,
  env,
});

// Stack 4: AgentCore Gateway (MCP Server)
const agentCoreGatewayStack = new AgentCoreGatewayStack(app, "AgentCoreGatewayStack", {
  paymentProxyApiUrl: paymentProxyStack.apiUrl,
  env,
});

// Stack 5: Strands Agent
const strandsAgentStack = new StrandsAgentStack(app, "StrandsAgentStack", {
  mcpEndpointUrl: agentCoreGatewayStack.mcpEndpointUrl,
  env,
});

// Stack 6: Frontend (CloudFront + S3)
new FrontendStack(app, "FrontendStack", {
  strandsAgentApiUrl: strandsAgentStack.apiUrl,
  env,
});
```

> **注意:** `StrandsAgentStack` にも `public readonly apiUrl: string` を追加する必要あり。

---

## デプロイ手順（全スタック）

```bash
# ① CDK 追加パッケージのインストール
cd cdk
bun add @aws-cdk/aws-lambda-python-alpha

# ② フロントエンド依存パッケージのインストール
cd ../frontend
bun add framer-motion @tanstack/react-query axios
bun add -d @types/node

# ③ CDK ビルド確認
cd ../cdk
npm run build

# ④ スタック順にデプロイ
npx cdk deploy SecretsStack

# EVM private key をシークレットに設定
aws secretsmanager put-secret-value \
  --secret-id x402/evm-private-key \
  --secret-string "0xYOUR_EVM_PRIVATE_KEY"

npx cdk deploy CdkStack
npx cdk deploy PaymentProxyStack
npx cdk deploy AgentCoreGatewayStack
npx cdk deploy StrandsAgentStack

# ⑤ フロントエンドをビルドしてから FrontendStack をデプロイ
cd ../frontend
bun run build          # → frontend/dist/ が生成される

cd ../cdk
npx cdk deploy FrontendStack

# ⑥ 動作確認
# CDK Outputs に表示された FrontendUrl をブラウザで開く
# または API を直接テスト:
curl -X POST <StrandsAgentApiUrl>/invoke \
  -H "Content-Type: application/json" \
  -d '{"message": "プレミアムデータを見せてください"}'
```

---

## 技術的な注意点・リスク

| 項目 | 詳細 |
|------|------|
| **AgentCore Gateway CDK L1** | `AWS::BedrockAgentCore::Gateway` の CloudFormation リソース名は本番 GA で変わる可能性あり。デプロイ前に `aws cloudformation describe-type` で確認 |
| **AgentCore 対応リージョン** | AgentCore は全リージョンで使えない。`us-east-1` / `us-west-2` を確認してから設定 |
| **Python Lambda bundling** | `@aws-cdk/aws-lambda-python-alpha` は Docker 必要。CI 環境要確認 |
| **Strands SDK MCP 接続** | `MCPClient` の API は SDK バージョンで変わる可能性あり。`strands-agents` のドキュメントを都度確認 |
| **Payment Proxy コールドスタート** | Secrets Manager 取得により初回は遅い (~1s)。Provisioned Concurrency の検討を推奨 |
| **Lambda@Edge リージョン** | 既存の Lambda@Edge は `us-east-1` 固定。全スタックを同リージョンに寄せる方針で統一済み |
| **CORS (StrandsAgentApi)** | フロントエンドの CloudFront URL からリクエストが来るため、StrandsAgentStack の API GW に CORS 設定が必要 |
| **フロントエンドビルド順序** | `FrontendStack` デプロイ前に `bun run build` で `frontend/dist/` を生成すること。未ビルドのままだとデプロイエラー |
| **config.json キャッシュ** | CloudFront が `/config.json` をキャッシュするため、API URL 変更時は `distributionPaths: ['/config.json']` でキャッシュ無効化 |

---

## 実装フェーズの優先度

```
Phase 1 (SecretsStack)         ✅ 簡単・他スタックのブロッカー
Phase 2 (CdkStack 修正)        ✅ 軽微な変更のみ
Phase 3 (PaymentProxyStack)    ✅ TypeScript + @x402/fetch で実装容易。単体テスト可能
Phase 4 (AgentCoreGateway)     ⚠️  L1 CfnResource を使用。GA ドキュメント要確認
Phase 5 (StrandsAgentStack)    ⚠️  Python + strands SDK。MCPClient API 要確認
Phase 6 (bin/cdk.ts)           ✅ 配線のみ
Phase 7 (FrontendStack)        ✅ CDK 標準構成。ビルド済み dist が必要
Phase 8 (bin/cdk.ts 最終)      ✅ FrontendStack の追加のみ
```

> **推奨アプローチ:**
> - Phase 3 まで → x402 自動支払い Proxy として単体動作確認
> - Phase 5 まで → MCP / AgentCore 統合のエンドツーエンド確認
> - Phase 7〜8 → フロントエンドから全フローを体験できる完成形
