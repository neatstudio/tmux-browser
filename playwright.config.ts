import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { headless: true, viewport: { width: 1440, height: 900 } }
});
