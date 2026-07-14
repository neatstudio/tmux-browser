import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";

const consoleErrors = new WeakMap<Page, string[]>();
const pageRequests = new WeakMap<Page, string[]>();
const browserFixture = JSON.parse(
  readFileSync(resolve("tests/e2e/structured-event-panel-fixture.json"), "utf8")
) as Array<Record<string, unknown>>;
const longCommand = String(
  browserFixture.find((record) => record.id === "long-command")?.content ?? ""
);

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  consoleErrors.set(page, errors);
  pageRequests.set(page, requests);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/tests/e2e/structured-event-panel-harness.html");
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

test("switches tabs and lazily reveals structured details", async ({ page }, testInfo) => {
  const requests = pageRequests.get(page)!;
  await page.getByRole("button", { name: "Actions" }).click();
  const dialog = page.getByRole("dialog", { name: "Action Center" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Activity/ })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByText("All focused tests passed")).toBeVisible();
  await expect(dialog.getByText("npm test")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  const settledRequestCount = requests.length;

  await dialog.getByRole("button", { name: /Show details for/ }).first().click();
  await expect(dialog.getByText("npm test")).toBeVisible();
  const collapse = dialog.getByRole("button", { name: /Hide details for/ }).first();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await expect(collapse).toBeFocused();
  await page.evaluate(() => new Promise<void>((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
  }));
  expect(requests.length).toBe(settledRequestCount);

  await dialog.getByRole("tab", { name: /Attention/ }).click();
  await expect(dialog.getByText("Approval needed")).toBeVisible();
  await expect(dialog.getByText("All focused tests passed")).toHaveCount(0);
  await attachScreenshot(page, testInfo, "structured-event-panel-attention");
});

test("shows at least three complete Activity rows in the default 390x844 view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Actions" }).click();

  const completeRows = page.locator('.structured-event-row[data-status="complete"]');
  expect(await completeRows.count()).toBeGreaterThanOrEqual(3);
  for (const row of (await completeRows.all()).slice(0, 3)) {
    await expect(row).toBeInViewport();
    await expect(row.locator(".structured-event-toggle")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    await expect(row.locator(".structured-event-details")).toHaveCount(0);
  }
});

test("routes an Attention toast to the selected event and keeps a dead target disabled", async ({ page }, testInfo) => {
  const toast = page.getByRole("dialog", { name: "Agent action needed" });
  await expect(toast).toBeVisible();
  await expect(toast.getByText("Review the command before it runs")).toBeVisible();
  await expect(toast.getByRole("button", { name: "Approve" })).toBeDisabled();
  await toast.getByRole("button", { name: "View details" }).click();

  const panel = page.getByRole("dialog", { name: "Action Center" });
  await expect(panel.getByRole("tab", { name: /Attention/ })).toHaveAttribute("aria-selected", "true");
  const selected = panel.locator("[data-event-id='attention-1']");
  await expect(selected).toHaveClass(/is-selected/);
  await expect(selected.getByRole("button", { name: "Approve" })).toBeDisabled();
  await attachScreenshot(page, testInfo, "structured-event-toast-attention-dead-target");
});

test("supports wrapped arrow and Home/End tab keyboard navigation", async ({ page }) => {
  await page.getByRole("button", { name: "Actions" }).click();
  const activity = page.getByRole("tab", { name: /Activity/ });
  const attention = page.getByRole("tab", { name: /Attention/ });
  await expect(activity).toHaveAttribute("tabindex", "0");
  await expect(attention).toHaveAttribute("tabindex", "-1");
  await activity.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(attention).toBeFocused();
  await expect(attention).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(activity).toBeFocused();
  await expect(activity).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(attention).toBeFocused();
});

test("bounds 1,000 history events and keeps 300 streaming revisions on one row", async ({ page }) => {
  const events = JSON.parse(
    readFileSync(resolve("tests/fixtures/structured-activity.json"), "utf8")
  );
  await page.route("**/api/timeline?limit=1000", (route) =>
    route.fulfill({ json: { events } })
  );
  await page.goto("/tests/e2e/structured-event-panel-harness.html?benchmark");
  await page.getByRole("button", { name: "Actions" }).click();
  const dialog = page.getByRole("dialog", { name: "Action Center" });
  await expect(dialog.locator(".structured-event-row")).toHaveCount(200);

  await page.goto("/tests/e2e/structured-event-panel-harness.html");
  await page.getByRole("button", { name: "Actions" }).click();
  const canonical = page.locator("[data-event-id='complete-1']");
  for (let revision = 1; revision <= 300; revision += 1) {
    await page.evaluate((value) => window.__structuredActivityTest.streamRevision(value), revision);
  }
  await expect(canonical).toHaveCount(1);
  await expect(canonical).toContainText("Streaming revision 300");
  await expect(page.locator(".structured-event-row")).toHaveCount(5);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 }
]) {
  test(`constrains long structured content at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Actions" }).click();
    const dialog = page.getByRole("dialog", { name: "Action Center" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: /Attention/ }).click();
    const attentionRow = dialog.locator("[data-event-id='attention-1']");
    const reason = attentionRow.getByText("Review the command before it runs");
    const primaryAction = attentionRow.getByRole("button", { name: "Approve" });
    await expect(reason).toBeVisible();
    await expect(primaryAction).toBeVisible();
    const attentionBounds = await dialog.evaluate((dialogElement) => {
      const dialogRect = dialogElement.getBoundingClientRect();
      const row = dialogElement.querySelector<HTMLElement>("[data-event-id='attention-1']")!;
      const reason = row.querySelector<HTMLElement>(".structured-event-summary")!;
      const action = [...row.querySelectorAll<HTMLElement>("button")]
        .find((button) => button.textContent?.trim() === "Approve")!;
      const reasonRect = reason.getBoundingClientRect();
      const actionRect = action.getBoundingClientRect();
      const inside = (rect: DOMRect) =>
        rect.left >= dialogRect.left && rect.right <= dialogRect.right &&
        rect.top >= dialogRect.top && rect.bottom <= dialogRect.bottom &&
        rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
      const overlap = !(
        reasonRect.right <= actionRect.left || actionRect.right <= reasonRect.left ||
        reasonRect.bottom <= actionRect.top || actionRect.bottom <= reasonRect.top
      );
      return { reasonInside: inside(reasonRect), actionInside: inside(actionRect), overlap };
    });
    expect(attentionBounds).toEqual({ reasonInside: true, actionInside: true, overlap: false });

    await dialog.getByRole("tab", { name: /Activity/ }).click();
    const longWordRow = dialog.locator("[data-event-id='complete-1']");
    await longWordRow.getByRole("button", { name: /Show details for/ }).click();
    const longWordScroller = longWordRow.locator(".structured-event-details pre").first();
    await expect(longWordScroller).toContainText("x".repeat(2048));
    const longCommandRow = dialog.locator("[data-event-id='long-command']");
    await longCommandRow.getByRole("button", { name: /Show details for/ }).click();
    const commandScroller = longCommandRow.locator(".structured-event-details pre").first();
    expect(longCommand.length).toBeGreaterThan(240);
    await expect(commandScroller).toHaveText(longCommand);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    for (const scroller of [longWordScroller, commandScroller]) {
      expect(await scroller.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await scroller.evaluate((node) => getComputedStyle(node).overflowX)).toBe("auto");
      const scrollerBox = await scroller.boundingBox();
      expect(scrollerBox).not.toBeNull();
      expect(scrollerBox!.x).toBeGreaterThanOrEqual(box!.x);
      expect(scrollerBox!.x + scrollerBox!.width).toBeLessThanOrEqual(box!.x + box!.width);
    }
    expect(await longWordScroller.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    const controlsFit = await dialog.evaluate((dialogElement) => {
      const dialogRect = dialogElement.getBoundingClientRect();
      return [...dialogElement.querySelectorAll("button")].every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.left >= dialogRect.left && rect.right <= dialogRect.right;
      });
    });
    expect(controlsFit).toBe(true);
    const regions = await dialog.locator(":scope > .action-center-header, :scope > .action-center-tabs, :scope > .action-center-list").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      })
    );
    expect(regions[0]!.bottom).toBeLessThanOrEqual(regions[1]!.top + 1);
    expect(regions[1]!.bottom).toBeLessThanOrEqual(regions[2]!.top + 1);
    await attachScreenshot(page, testInfo, `structured-event-panel-${viewport.width}x${viewport.height}`);
  });
}
