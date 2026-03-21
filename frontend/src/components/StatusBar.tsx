interface StatusBarProps {
  isLoading: boolean;
}

export function StatusBar({ isLoading }: StatusBarProps) {
  return (
    <header className="status-bar">
      <div className="status-left">
        <span className="status-protocol">x402</span>
        <span className="status-separator">/</span>
        <span className="status-label">PAYMENT TERMINAL</span>
      </div>
      <div className="status-right">
        <span className={`status-indicator ${isLoading ? "active" : "idle"}`} />
        <span className="status-text">{isLoading ? "AGENT THINKING" : "READY"}</span>
        <span className="status-network">Base Sepolia</span>
      </div>
    </header>
  );
}
