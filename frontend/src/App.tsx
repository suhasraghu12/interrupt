import { CallView } from "./components/CallView";
import { TranscriptPanel } from "./components/TranscriptPanel";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Interrupt</h1>
        <p>A voice agent that knows when you're actually done talking.</p>
      </header>
      <div className="card">
        <CallView />
      </div>
      <div className="card transcript-card">
        <TranscriptPanel />
      </div>
    </div>
  );
}
