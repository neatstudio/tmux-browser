import { expect, test, type Page } from "@playwright/test";

const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/e2e/structured-event-panel-harness.html");
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

test("switches tabs and lazily reveals structured details", async ({ page }) => {
  await page.getByRole("button", { name: "Actions" }).click();
  const dialog = page.getByRole("dialog", { name: "Action Center" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Activity/ })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByText("All focused tests passed")).toBeVisible();
  await expect(dialog.getByText("npm test")).toHaveCount(0);

  await dialog.getByRole("button", { name: /Show details for/ }).first().click();
  await expect(dialog.getByText("npm test")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Hide details for/ }).first()).toHaveAttribute("aria-expanded", "true");

  await dialog.getByRole("tab", { name: /Attention/ }).click();
  await expect(dialog.getByText("Approval needed")).toBeVisible();
  await expect(dialog.getByText("All focused tests passed")).toHaveCount(0);
  await expect(dialog).toHaveScreenshot("structured-event-panel-attention.png");
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 }
]) {
  test(`constrains long structured content at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Actions" }).click();
    const dialog = page.getByRole("dialog", { name: "Action Center" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Show details for/ }).first().click();
    const detailScroller = dialog.locator(".structured-event-details pre").first();
    await expect(detailScroller).toContainText("x".repeat(2048));
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await detailScroller.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await detailScroller.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
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
    await expect(dialog).toHaveScreenshot(`structured-event-panel-${viewport.width}x${viewport.height}.png`);
  });
}
