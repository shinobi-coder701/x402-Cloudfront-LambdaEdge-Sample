import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import type { Message } from "../types";
import { MessageBubble } from "./MessageBubble";
import { ThinkingDots } from "./ThinkingDots";

interface ChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  onSend: (text: string) => void;
}

const SUGGESTIONS = [
  "Say hello",
  "Show me the premium analytics",
  "Fetch the article content",
];

export function ChatPanel({ messages, isLoading, onSend }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    onSend(text);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <section className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <p className="welcome-title">x402 AI Agent</p>
            <p className="welcome-desc">
              Ask me to access premium content. I'll pay automatically using USDC on Base Sepolia.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggestion-chip" onClick={() => onSend(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className="message-bubble agent thinking">
            <ThinkingDots />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the agent… (Enter to send)"
          rows={2}
          disabled={isLoading}
        />
        <button
          className="send-button"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          SEND
        </button>
      </div>
    </section>
  );
}
