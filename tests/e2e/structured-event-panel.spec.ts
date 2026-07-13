import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/e2e/structured-event-panel-harness.html");
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

for (const width of [390, 768, 1440]) {
  test(`constrains long structured content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Actions" }).click();
    const dialog = page.getByRole("dialog", { name: "Action Center" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  });
}
