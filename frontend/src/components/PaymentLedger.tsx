import type { PaymentRecord } from "../types";
import { PaymentCard } from "./PaymentCard";

interface PaymentLedgerProps {
  payments: PaymentRecord[];
}

export function PaymentLedger({ payments }: PaymentLedgerProps) {
  const totalUsdc = payments
    .reduce((sum, p) => sum + parseFloat(p.amountUsdc), 0)
    .toFixed(3);

  return (
    <aside className="payment-ledger">
      <div className="ledger-header">
        <h2 className="ledger-title">PAYMENT LEDGER</h2>
        <div className="ledger-total">
          <span className="ledger-total-label">TOTAL</span>
          <span className="ledger-total-amount">${totalUsdc}</span>
          <span className="ledger-total-unit">USDC</span>
        </div>
      </div>

      <div className="ledger-cards">
        {payments.length === 0 ? (
          <p className="ledger-empty">No payments yet. Ask the agent to fetch content.</p>
        ) : (
          payments.map((p, i) => (
            <PaymentCard key={p.id} payment={p} index={i} />
          ))
        )}
      </div>
    </aside>
  );
}
