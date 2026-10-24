import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import { WorkspaceProvider } from "./data/WorkspaceContext";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage, TestsPage, TestDetailPage, RunsPage, RunDetailPage, BugsPage, BugDetailPage, GeneratePage, ChatPage, SettingsPage, NotFoundPage } from "./routes/WorkspacePages";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <WorkspaceProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tests" element={<TestsPage />} />
            <Route path="/tests/:id" element={<TestDetailPage />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/runs/:id" element={<RunDetailPage />} />
            <Route path="/bugs" element={<BugsPage />} />
            <Route path="/bugs/:id" element={<BugDetailPage />} />
            <Route path="/generate" element={<GeneratePage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </WorkspaceProvider>
    </BrowserRouter>
  </StrictMode>,
);
