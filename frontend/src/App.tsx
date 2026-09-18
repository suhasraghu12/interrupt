import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { BenchmarkPanel } from "./components/BenchmarkPanel";
import { CallView } from "./components/CallView";
import { LatencyDashboard } from "./components/LatencyDashboard";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { SessionProvider } from "./lib/session";

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<CallView />} />
            <Route path="transcript" element={<TranscriptPanel />} />
            <Route path="latency" element={<LatencyDashboard />} />
            <Route path="benchmark" element={<BenchmarkPanel />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
