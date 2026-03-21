export interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date;
  toolUsed?: string;
  paymentUsdc?: string;
}

export interface PaymentRecord {
  id: string;
  tool: string;
  amountUsdc: string;
  timestamp: Date;
  status: "pending" | "confirmed";
}

export const TOOL_PRICES: Record<string, string> = {
  getHelloContent: "0.001",
  getPremiumData: "0.010",
  getArticleContent: "0.005",
};
