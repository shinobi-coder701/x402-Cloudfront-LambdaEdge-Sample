import { useAgent } from "./hooks/useAgent";
import { StatusBar } from "./components/StatusBar";
import { ChatPanel } from "./components/ChatPanel";
import { PaymentLedger } from "./components/PaymentLedger";
import "./App.css";

function App() {
  const { messages, payments, isLoading, sendMessage } = useAgent();

  return (
    <div className="app-root">
      <StatusBar isLoading={isLoading} />
      <div className="app-body">
        <ChatPanel
          messages={messages}
          isLoading={isLoading}
          onSend={sendMessage}
        />
        <PaymentLedger payments={payments} />
      </div>
    </div>
  );
}

export default App;
