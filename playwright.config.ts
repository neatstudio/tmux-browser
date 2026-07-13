import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.CI
  ? undefined
  : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
    (existsSync(localChrome) ? localChrome : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/playwright",
  snapshotDir: "tests/e2e/__screenshots__",
  snapshotPathTemplate: "{snapshotDir}/{testFilePath}-snapshots/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath }
  },
  webServer: {
    command: "npm run dev:client -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI
  }
});
