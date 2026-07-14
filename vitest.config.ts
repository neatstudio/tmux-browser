import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const nestedWorktrees = `${resolve(process.cwd(), ".worktrees")}/**`;

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "tests/e2e/**",
      nestedWorktrees,
      "release/**",
    ],
  },
});
