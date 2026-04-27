import { Buffer } from "buffer";
import process from "process";
// Polyfill Buffer/process globally for browser deps (mdb-reader, browserify-aes, readable-stream, etc.)
(globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;
(globalThis as any).process = (globalThis as any).process || process;
(globalThis as any).global = (globalThis as any).global || globalThis;

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
