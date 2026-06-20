import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App.js";
import { ToastProvider } from "./ui/kit/index.js";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
