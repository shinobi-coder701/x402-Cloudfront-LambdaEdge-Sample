"""
Strands Agent Lambda handler
x402 対応コンテンツに MCP 経由でアクセスする AI エージェント。

AgentCore Gateway に AWS IAM 認証付きで接続し、
x402 保護されたコンテンツへのアクセスを MCP ツールとして利用する。
"""
import os
import json
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient
# AgentCore Gateway は AWS IAM 認証が必要 → mcp-proxy-for-aws を使用
from mcp_proxy_for_aws.client import aws_iam_streamablehttp_client

GATEWAY_MCP_URL = os.environ["AGENT_CORE_GATEWAY_MCP_URL"]
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-6-20251101-v1:0",
    region_name=AWS_REGION,
)

# AgentCore Gateway に MCP クライアントとして接続（AWS IAM 署名付き）
# MCPClient はトランスポートファクトリ関数（lambda）を受け取る
mcp_client = MCPClient(
    lambda: aws_iam_streamablehttp_client(
        endpoint=GATEWAY_MCP_URL,
        aws_region=AWS_REGION,
        aws_service="bedrock-agentcore",
    )
)

# マネージドパターン: Agent に MCPClient を直接渡すとライフサイクルを自動管理
agent = Agent(
    model=model,
    tools=[mcp_client],
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
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "message is required"}),
        }

    try:
        response = agent(user_message)

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({
                "session_id": session_id,
                "response": str(response),
            }),
        }
    except Exception as e:
        print(f"Agent error: {e}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
