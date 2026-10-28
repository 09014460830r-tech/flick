import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Render synchronously so the memo field exists (and is focused) before the first keystroke can land.
const root = createRoot(document.getElementById("root")!);
flushSync(() =>
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
