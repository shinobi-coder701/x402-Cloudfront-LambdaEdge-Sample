import { motion } from "framer-motion";
import type { PaymentRecord } from "../types";
import { ToolBadge } from "./ToolBadge";

interface PaymentCardProps {
  payment: PaymentRecord;
  index: number;
}

export function PaymentCard({ payment, index }: PaymentCardProps) {
  return (
    <motion.div
      className="payment-card"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <div className="payment-card-header">
        <ToolBadge toolName={payment.tool} />
        <span className={`payment-status ${payment.status}`}>
          {payment.status === "confirmed" ? "✓ CONFIRMED" : "⏳ PENDING"}
        </span>
      </div>
      <div className="payment-card-body">
        <span className="payment-amount">${payment.amountUsdc}</span>
        <span className="payment-unit">USDC</span>
      </div>
      <div className="payment-card-footer">
        {payment.timestamp.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </div>
    </motion.div>
  );
}
