import { defineConfig } from "vitest/config";
import path from "path";

// Pruebas unitarias de funciones puras: entorno node, sin plugins de React.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // src/domain/**/calculations.test.ts usan describe/it/expect sin importarlos.
    globals: true,
  },
});
