import { CallView } from "./components/CallView";
import { TranscriptPanel } from "./components/TranscriptPanel";

export default function App() {
  return (
    <div>
      <h1>Interrupt</h1>
      <CallView />
      <TranscriptPanel />
    </div>
  );
}
