import { useCallback, useRef, useState } from "react";
import { loadConfig } from "../lib/config";
import type { Message, PaymentRecord } from "../types";

export function useAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const sessionId = useRef(crypto.randomUUID());

  const sendMessage = useCallback(async (text: string) => {
    const config = await loadConfig();

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch(`${config.strandsAgentApiUrl}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId.current }),
      });
      const data = await res.json();

      const agentMsg: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        content: data.response ?? data.error ?? "No response",
        timestamp: new Date(),
        toolUsed: data.tool_used,
        paymentUsdc: data.payment_usdc,
      };
      setMessages((prev) => [...prev, agentMsg]);

      if (data.tool_used && data.payment_usdc) {
        setPayments((prev) => [
          {
            id: crypto.randomUUID(),
            tool: data.tool_used,
            amountUsdc: data.payment_usdc,
            timestamp: new Date(),
            status: "confirmed",
          },
          ...prev,
        ]);
      }
    } catch (err) {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        content: `Error: ${String(err)}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { messages, payments, isLoading, sendMessage };
}
