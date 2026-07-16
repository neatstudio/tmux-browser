import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { platform } from "node:os";

type HarnessState = {
  sentMessages: Array<{ type: string; data?: string; cols?: number; rows?: number }>;
  terminalSize: { cols: number; rows: number };
  visibleText: string;
  copiedText: string;
  paneSummaryCalls: number;
  paneClicks: string[];
  lastSnapshot: {
    text: string;
    startLine: number;
  } | null;
  typography: {
    fontFamily: string;
    fontSize: string;
    lineHeight: string;
  };
};

declare global {
  interface Window {
    __terminalTranscriptHarness: {
      emitPty: (data: string) => void;
      sendInterrupt: () => void;
      setLiveTranscript: (enabled: boolean) => void;
      toggleBrowserScroll: () => void;
      copyPaneSelectionWithCtrlC: () => void;
      getState: () => HarnessState;
    };
  }
}

test("copies a real pane selection without sending an interrupt", async ({ page }) => {
  await page.evaluate(() => window.__terminalTranscriptHarness.emitPty(
    "\x1b[2J\x1b[HLEFT-PANE-CONTENT          RIGHT-PANE-CONTENT\r\nSECOND-PANE-ROW"
  ));
  await page.getByRole("button", { name: "Raw terminal" }).click();
  await expect.poll(() => getHarnessState(page)).toMatchObject({
    visibleText: expect.stringContaining("LEFT-PANE-CONTENT")
  });

  const screen = page.locator(".xterm-screen");
  const bounds = await screen.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 8, bounds!.y + 10);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 135, bounds!.y + 10, { steps: 6 });
  await page.mouse.up();

  const before = await getHarnessState(page);
  await page.evaluate(() => window.__terminalTranscriptHarness.copyPaneSelectionWithCtrlC());
  const after = await getHarnessState(page);
  expect(after.copiedText).toContain("LEFT-PANE");
  expect(after.sentMessages.filter(
    (message) => message.type === "input" && message.data === "\x03"
  )).toHaveLength(before.sentMessages.filter(
    (message) => message.type === "input" && message.data === "\x03"
  ).length);

  await page.getByRole("button", { name: "Agent output" }).click();
  await expect(page.locator(".terminal-structured-output")).toBeVisible();
});

test("updates the live transcript from the real xterm viewport scroll", async ({ page }) => {
  const initial = await getHarnessState(page);
  const filler = Array.from(
    { length: initial.terminalSize.rows + 8 },
    (_, index) => `raw filler ${index}`
  );
  const lines = [
    "OLD VIEW NARRATIVE",
    "• Ran old-run-marker",
    "  ✓ old run complete",
    "• Explored old-tree-marker",
    "  └ Read old file",
    ...filler,
    "CURRENT VIEW NARRATIVE",
    "• Ran current-run-marker",
    "  ✓ current run complete",
    "• Explored current-tree-marker",
    "  └ Read current file"
  ];

  await page.evaluate(() => window.__terminalTranscriptHarness.setLiveTranscript(true));
  await page.evaluate((data) => window.__terminalTranscriptHarness.emitPty(data),
    `\x1b[2J\x1b[H${lines.join("\r\n")}`
  );
  await expect(page.locator(".terminal-structured-output")).toContainText(
    "CURRENT VIEW NARRATIVE"
  );
  const beforeScroll = await getHarnessState(page);

  await page.getByRole("button", { name: "Raw terminal" }).click();
  await page.evaluate(() => window.__terminalTranscriptHarness.toggleBrowserScroll());
  await page.locator(".xterm").hover();
  for (let step = 0; step < 12; step += 1) {
    await page.mouse.wheel(0, -600);
  }

  await expect.poll(() => getHarnessState(page)).toMatchObject({
    lastSnapshot: {
      text: expect.stringContaining("OLD VIEW NARRATIVE"),
      startLine: expect.any(Number)
    }
  });
  const afterScroll = await getHarnessState(page);
  expect(afterScroll.lastSnapshot!.startLine).toBeLessThan(
    beforeScroll.lastSnapshot!.startLine
  );
  await page.getByRole("button", { name: "Agent output" }).click();
  await expect(page.locator(".terminal-structured-output")).toContainText(
    "OLD VIEW NARRATIVE"
  );
});

test("keeps pane routing and dimensions stable across overlay switches", async ({ page }) => {
  await page.evaluate(() => window.__terminalTranscriptHarness.emitPty(
    "\x1b[2J\x1b[HLEFT PANE                      RIGHT PANE"
  ));
  const before = await getHarnessState(page);
  await page.getByRole("button", { name: "Raw terminal" }).click();
  const screen = page.locator(".xterm-screen");
  const bounds = await screen.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width * 0.75, bounds!.y + 12);

  await expect.poll(() => getHarnessState(page)).toMatchObject({
    paneClicks: expect.arrayContaining(["%2"])
  });
  await page.getByRole("button", { name: "Agent output" }).click();
  await page.getByRole("button", { name: "Raw terminal" }).click();
  const after = await getHarnessState(page);
  expect(after.paneSummaryCalls).toBeGreaterThan(before.paneSummaryCalls);
  expect(after.terminalSize).toEqual(before.terminalSize);
});

test("keeps a clickable live xterm tail below Agent output", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const before = await getHarnessState(page);
  await page.evaluate(() => window.__terminalTranscriptHarness.emitPty(
    "\x1b[2J\x1b[H\x1b[999BLIVE PROMPT> "
  ));

  const xterm = page.locator(".xterm");
  const overlay = page.locator(".terminal-structured-output");
  await expect(xterm).toBeVisible();
  await expect(overlay).toBeVisible();
  const geometry = await page.evaluate(() => {
    const xtermRect = document.querySelector<HTMLElement>(".xterm")!.getBoundingClientRect();
    const overlayRect = document.querySelector<HTMLElement>(".terminal-structured-output")!
      .getBoundingClientRect();
    return {
      xterm: { top: xtermRect.top, bottom: xtermRect.bottom, height: xtermRect.height },
      overlay: { top: overlayRect.top, bottom: overlayRect.bottom, height: overlayRect.height }
    };
  });
  expect(geometry.overlay.height).toBeGreaterThan(0);
  expect(geometry.xterm.bottom - geometry.overlay.bottom).toBeGreaterThan(0);
  await expect.poll(() => getHarnessState(page)).toMatchObject({
    visibleText: expect.stringContaining("LIVE PROMPT>")
  });

  const paneClicksBeforeUpperClick = (await getHarnessState(page)).paneClicks.length;
  await page.mouse.click(
    (await overlay.boundingBox())!.x + 12,
    (await overlay.boundingBox())!.y + (await overlay.boundingBox())!.height / 2
  );
  expect((await getHarnessState(page)).paneClicks).toHaveLength(paneClicksBeforeUpperClick);

  const xtermBox = await xterm.boundingBox();
  expect(xtermBox).not.toBeNull();
  await page.mouse.click(xtermBox!.x + 20, xtermBox!.y + xtermBox!.height - 12);
  const sentBeforeTyping = (await getHarnessState(page)).sentMessages.length;
  await page.keyboard.type("hello");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await getHarnessState(page)).sentMessages
    .slice(sentBeforeTyping)
    .filter((message) => message.type === "input")
    .map((message) => message.data ?? "")
    .join(""))
    .toContain("hello\r");

  await page.evaluate(() => window.__terminalTranscriptHarness.emitPty("hello\r\nLIVE PROMPT> "));
  await expect.poll(() => getHarnessState(page)).toMatchObject({
    visibleText: expect.stringContaining("hello")
  });
  await page.keyboard.press("Control+c");
  await expect.poll(() => getHarnessState(page)).toMatchObject({
    sentMessages: expect.arrayContaining([{ type: "input", data: "\x03" }])
  });

  await page.getByRole("button", { name: "Raw terminal" }).click();
  await page.getByRole("button", { name: "Agent output" }).click();
  expect((await getHarnessState(page)).terminalSize).toEqual(before.terminalSize);
  await attachScreenshot(page, testInfo, "phone-live-tail");

  await page.setViewportSize({ width: 390, height: 320 });
  await expect.poll(async () => (await getHarnessState(page)).terminalSize.rows)
    .toBeLessThan(before.terminalSize.rows);
  const shortViewportBaseline = (await getHarnessState(page)).terminalSize;
  const shortGeometry = await page.evaluate(() => {
    const xtermRect = document.querySelector<HTMLElement>(".xterm")!.getBoundingClientRect();
    const overlayRect = document.querySelector<HTMLElement>(".terminal-structured-output")!
      .getBoundingClientRect();
    return {
      overlayHeight: overlayRect.height,
      tailHeight: xtermRect.bottom - overlayRect.bottom
    };
  });
  expect(shortGeometry.overlayHeight).toBeGreaterThan(0);
  expect(shortGeometry.tailHeight).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Raw terminal" }).click();
  await page.getByRole("button", { name: "Agent output" }).click();
  expect((await getHarnessState(page)).terminalSize).toEqual(shortViewportBaseline);
  await attachScreenshot(page, testInfo, "short-viewport-live-tail");
});

test("keeps alternate-screen content isolated while the overlay toggles", async ({ page }) => {
  await page.evaluate(() => window.__terminalTranscriptHarness.emitPty(
    "\x1b[2J\x1b[HPRIMARY BUFFER CONTENT"
  ));
  await expect.poll(() => getHarnessState(page)).toMatchObject({
    visibleText: expect.stringContaining("PRIMARY BUFFER CONTENT")
  });
  const before = await getHarnessState(page);

  await page.evaluate(() => window.__terminalTranscriptHarness.emitPty(
    "\x1b[?1049h\x1b[2J\x1b[H\x1b[999BALTERNATE SCREEN CONTENT - Ctrl+C to exit"
  ));
  await expect(page.locator(".xterm")).toBeVisible();
  await page.getByRole("button", { name: "Raw terminal" }).click();
  await expect.poll(() => getHarnessState(page)).toMatchObject({
    visibleText: expect.stringContaining("ALTERNATE SCREEN CONTENT")
  });
  await page.evaluate(() => window.__terminalTranscriptHarness.sendInterrupt());
  await page.getByRole("button", { name: "Agent output" }).click();
  await page.evaluate(() => window.__terminalTranscriptHarness.emitPty("\x1b[?1049l"));
  await expect.poll(() => getHarnessState(page)).toMatchObject({
    visibleText: expect.stringContaining("PRIMARY BUFFER CONTENT")
  });
  await page.getByRole("button", { name: "Raw terminal" }).click();
  const after = await getHarnessState(page);
  expect(after.visibleText).not.toContain("ALTERNATE SCREEN CONTENT");
  expect(after.terminalSize).toEqual(before.terminalSize);
  expect(after.sentMessages).toEqual(expect.arrayContaining([
    { type: "input", data: "\x03" }
  ]));
});

const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/e2e/terminal-transcript-harness.html");
  await expect(page.locator(".terminal-panel")).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const relativePath = `screenshots/${testInfo.project.name}/${platform()}/${name}.png`;
  const path = testInfo.outputPath(relativePath);
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function getHarnessState(page: Page) {
  return page.evaluate(() => window.__terminalTranscriptHarness.getState());
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 }
]) {
  test(`keeps terminal transcript behavior intact at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.reload();
    await expect(page.locator(".terminal-structured-output")).toBeVisible();

    const rawTerminal = page.getByRole("button", { name: "Raw terminal" });
    const menu = page.getByRole("button", { name: "Open session menu" });
    await expect(rawTerminal).toBeVisible();
    await expect(menu).toBeVisible();
    await attachScreenshot(page, testInfo, `${viewport.name}-collapsed`);

    const before = await getHarnessState(page);
    await page.evaluate(() => window.__terminalTranscriptHarness.sendInterrupt());
    await expect.poll(() => getHarnessState(page)).toMatchObject({
      sentMessages: expect.arrayContaining([{ type: "input", data: "\x03" }])
    });

    const rawMenuOverlap = await page.evaluate(() => {
      const raw = document.querySelector<HTMLElement>("[data-action='show-raw-terminal']")!;
      const menuButton = document.querySelector<HTMLElement>(".session-floating-menu-toggle")!;
      const rawRect = raw.getBoundingClientRect();
      const menuRect = menuButton.getBoundingClientRect();
      return !(
        rawRect.right <= menuRect.left || menuRect.right <= rawRect.left ||
        rawRect.bottom <= menuRect.top || menuRect.bottom <= rawRect.top
      );
    });
    expect(rawMenuOverlap).toBe(false);

    await page.evaluate(() => window.__terminalTranscriptHarness.emitPty("\r\nPTY output while overlay is visible"));
    await rawTerminal.click();
    await expect.poll(() => getHarnessState(page)).toMatchObject({
      visibleText: expect.stringContaining("PTY output while overlay is visible"),
      terminalSize: before.terminalSize
    });

    await page.getByRole("button", { name: "Agent output" }).click();
    const activities = page.locator("[data-action='toggle-terminal-transcript']");
    await expect(activities).toHaveCount(3);
    await activities.nth(0).click();
    await expect(activities.nth(0)).toHaveAttribute("aria-expanded", "true");
    await attachScreenshot(page, testInfo, `${viewport.name}-first-expanded`);

    await activities.nth(1).click();
    await expect(activities.nth(0)).toHaveAttribute("aria-expanded", "false");
    await expect(activities.nth(1)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".terminal-agent-transcript-detail")).toHaveCount(1);
    await attachScreenshot(page, testInfo, `${viewport.name}-second-expanded`);

    const presentation = await page.evaluate(() => {
      const transcript = document.querySelector<HTMLElement>(".terminal-agent-transcript")!;
      const activity = document.querySelector<HTMLElement>("[data-action='toggle-terminal-transcript']")!;
      const detail = document.querySelector<HTMLElement>(".terminal-agent-transcript-detail")!;
      const overlay = document.querySelector<HTMLElement>(".terminal-structured-output")!;
      const transcriptStyle = getComputedStyle(transcript);
      const activityStyle = getComputedStyle(activity);
      const detailStyle = getComputedStyle(detail);
      return {
        transcript: {
          fontFamily: transcriptStyle.fontFamily,
          fontSize: transcriptStyle.fontSize,
          lineHeight: transcriptStyle.lineHeight
        },
        activityBorder: activityStyle.borderWidth,
        detailBorder: detailStyle.borderWidth,
        overflow: overlay.scrollWidth > overlay.clientWidth
      };
    });
    expect(presentation.transcript).toEqual(before.typography);
    expect(presentation.activityBorder).toBe("0px");
    expect(presentation.detailBorder).toBe("0px");
    expect(presentation.overflow).toBe(false);
  });
}
