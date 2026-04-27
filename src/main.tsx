import { Buffer } from "buffer";
// Polyfill Buffer globally for browser deps (mdb-reader, browserify-aes, etc.)
(globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;
(globalThis as any).global = (globalThis as any).global || globalThis;

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
