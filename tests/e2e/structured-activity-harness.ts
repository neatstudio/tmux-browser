import type { Browser } from "@playwright/test";

const START_MARK = "pre-activity-action-center-open-start";
const INTERACTIVE_MARK = "pre-activity-action-center-interactive";

export async function runStructuredActivityHarness(
  browser: Browser,
  targetUrl: string,
  fixture: Array<Record<string, unknown>>
) {
  const results: number[] = [];
  for (let run = 0; run < 5; run += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route("**/api/timeline?**", (route) =>
      route.fulfill({ json: { events: fixture } })
    );
    await page.goto(targetUrl, { waitUntil: "networkidle" });
    const actions = page.getByRole("button", { name: "Actions" });
    await actions.waitFor();
    await page.evaluate((mark) => performance.mark(mark), START_MARK);
    await actions.click();
    await page.getByRole("dialog", { name: "Action Center" }).waitFor();
    const duration = await page.evaluate(
      ({ start, interactive }) => {
        performance.mark(interactive);
        performance.measure("pre-activity-action-center-open", start, interactive);
        return performance.getEntriesByName("pre-activity-action-center-open").at(-1)!.duration;
      },
      { start: START_MARK, interactive: INTERACTIVE_MARK }
    );
    results.push(duration);
    await context.close();
  }
  return results;
}
