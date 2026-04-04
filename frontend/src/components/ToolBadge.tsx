import { TOOL_PRICES } from "../types";

interface ToolBadgeProps {
  toolName: string;
}

const TOOL_LABELS: Record<string, string> = {
  getHelloContent: "Hello",
  getPremiumData: "Premium",
  getArticleContent: "Article",
};

export function ToolBadge({ toolName }: ToolBadgeProps) {
  const label = TOOL_LABELS[toolName] ?? toolName;
  const price = TOOL_PRICES[toolName];

  return (
    <span className="tool-badge">
      <span className="tool-name">{label}</span>
      {price && <span className="tool-price">${price} USDC</span>}
    </span>
  );
}
