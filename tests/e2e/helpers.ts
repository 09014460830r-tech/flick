import { expect, type Locator, type Page } from "@playwright/test";

export const tasks = (page: Page) => page.getByTestId("task");
export const taskByText = (page: Page, text: string) => tasks(page).filter({ hasText: text });
export const memo = (page: Page) => page.getByLabel("メモ", { exact: true });

/** Fresh signed-in session for a unique user (dev login exists only in the e2e environment). */
export async function login(page: Page, name = `user-${Math.random().toString(36).slice(2, 10)}`) {
  await page.goto(`/auth/dev-login?name=${encodeURIComponent(name)}`);
  await expect(page.getByRole("button", { name: "アカウント" })).toBeVisible();
  return name;
}

export async function ready(page: Page) {
  await expect(page.getByTestId("skeleton")).toHaveCount(0);
  await expect(page.getByRole("tablist")).toBeVisible();
}

export async function addTask(page: Page, text: string) {
  await memo(page).fill(text);
  await memo(page).press("Enter");
  await expect(taskByText(page, text)).toHaveCount(1);
}

/**
 * Flicks a card horizontally. On touch devices this sends real touch events through CDP,
 * otherwise it drags with the mouse — the same pointer path a user takes.
 */
export async function flick(page: Page, row: Locator, dx: number, opts: { steps?: number } = {}) {
  const card = row.locator(".card");
  await card.scrollIntoViewIfNeeded();
  // A flicked card flies out and springs back; a person grabs it once it is at rest.
  await expect.poll(() => card.evaluate((el) => el.style.transform), { timeout: 8000 }).toMatch(/^(none)?$/);
  const box = await settled(card);
  const startX = box.x + box.width / 2 - dx / 4;
  const y = box.y + box.height / 2;
  const steps = opts.steps ?? 12;
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);

  if (hasTouch) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, x: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
      });
    await touch("touchStart", startX);
    for (let i = 1; i <= steps; i++) {
      await touch("touchMove", startX + (dx * i) / steps);
      await page.waitForTimeout(16);
    }
    await touch("touchEnd", startX + dx);
    await cdp.detach();
  } else {
    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(startX + (dx * i) / steps, y);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  }
}

/** Waits until an animated element stops moving and returns its resting box. */
export async function settled(locator: Locator) {
  let last = "";
  for (let i = 0; i < 60; i++) {
    const box = await locator.boundingBox();
    const key = JSON.stringify(box && [Math.round(box.x), Math.round(box.y), Math.round(box.width)]);
    if (box && key === last) return box;
    last = key;
    await locator.page().waitForTimeout(80);
  }
  throw new Error("element never settled");
}
