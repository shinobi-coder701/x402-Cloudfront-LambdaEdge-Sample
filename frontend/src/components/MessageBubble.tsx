import { motion } from "framer-motion";
import type { Message } from "../types";
import { ToolBadge } from "./ToolBadge";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      className={`message-bubble ${isUser ? "user" : "agent"}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="bubble-header">
        <span className="bubble-role">{isUser ? "YOU" : "AGENT"}</span>
        <span className="bubble-time">
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div className="bubble-content">{message.content}</div>
      {message.toolUsed && (
        <div className="bubble-tool">
          <ToolBadge toolName={message.toolUsed} />
        </div>
      )}
    </motion.div>
  );
}
