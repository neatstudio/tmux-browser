import { defineConfig } from "vite";
import packageJson from "./package.json" with { type: "json" };

export default defineConfig({
  define: {
    __TMUX_UI_CLIENT_VERSION__: JSON.stringify(packageJson.version)
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  }
});
