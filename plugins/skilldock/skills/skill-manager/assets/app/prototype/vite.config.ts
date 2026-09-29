// [PROTOTYPE] A separate entry, with no production API proxy or route changes.
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/prototype/",
  cacheDir: fileURLToPath(new URL(".cache/vite", import.meta.url)),
  plugins: [{
    name: "prototype-scoped-reused-styles",
    enforce: "pre",
    transform(code, id) {
      if (/\/src\/(Tags|DiffBrowser|DuplicateSkillsDialog)\.css(?:\?|$)/.test(id)) {
        return `@scope (.sd-prototype) {\n${code}\n}`;
      }
    },
  }],
  server: { host: "127.0.0.1", port: 4780, strictPort: true, fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  build: { outDir: "dist", emptyOutDir: true },
});
