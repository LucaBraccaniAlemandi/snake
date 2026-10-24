import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import { TestsPage } from "./routes/TestsPage";
import { TestPage } from "./routes/TestPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TestsPage />} />
        <Route path="/tests/:id" element={<TestPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
