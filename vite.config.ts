import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        coast: resolve(root, "coast/index.html"),
        flags: resolve(root, "flags/index.html"),
        terrain: resolve(root, "terrain/index.html")
      }
    }
  },
  test: {
    environment: "node"
  }
});
