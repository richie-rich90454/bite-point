import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("keeps the session list, controls and settings inside the viewport", async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem(
            "bite-point.settings.v2",
            JSON.stringify({
                version: 2,
                quality: "low",
                renderScale: 0.6,
                shadows: false,
                audioEnabled: false,
            }),
        );
    });
    await page.goto("/");
    await expect(page.locator(".start-overlay")).toBeVisible();

    const startLayout = await page.evaluate(() => {
        const grid = document.querySelector<HTMLElement>(".scenario-grid");
        const shell = document.querySelector<HTMLElement>(".start-shell");
        return {
            gridScrollable: grid ? grid.scrollHeight > grid.clientHeight : false,
            shellWidth: shell?.getBoundingClientRect().width ?? 0,
            viewport: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
        };
    });
    expect(startLayout.gridScrollable).toBe(true);
    expect(startLayout.shellWidth).toBeLessThanOrEqual(startLayout.viewport);
    expect(startLayout.documentWidth).toBeLessThanOrEqual(startLayout.viewport + 1);
    await page.screenshot({ path: "test-results/start-layout.png" });

    await page.locator('[data-ui="start"]').click();
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeVisible();
    await page.locator('[data-tab="controls"]').click();

    const controlsLayout = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>(".pause-main");
        const list = document.querySelector<HTMLElement>(".binding-list");
        return {
            mainScrollable: main
                ? main.scrollHeight > main.clientHeight || main.clientHeight > 0
                : false,
            listWidth: list?.getBoundingClientRect().width ?? 0,
            mainWidth: main?.getBoundingClientRect().width ?? 0,
            documentWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
        };
    });
    expect(controlsLayout.listWidth).toBeLessThanOrEqual(controlsLayout.mainWidth + 1);
    expect(controlsLayout.documentWidth).toBeLessThanOrEqual(controlsLayout.viewport + 1);
    await page.screenshot({ path: "test-results/controls-layout.png" });

    await page.locator('[data-tab="settings"]').click();
    const settingsLayout = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>(".pause-main");
        const grid = document.querySelector<HTMLElement>(".settings-grid");
        return {
            mainScrollable: main
                ? main.scrollHeight > main.clientHeight || main.clientHeight > 0
                : false,
            gridWidth: grid?.getBoundingClientRect().width ?? 0,
            mainWidth: main?.getBoundingClientRect().width ?? 0,
            documentWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            middleDots: document.body.innerText.includes("·"),
        };
    });
    expect(settingsLayout.gridWidth).toBeLessThanOrEqual(settingsLayout.mainWidth + 1);
    expect(settingsLayout.documentWidth).toBeLessThanOrEqual(settingsLayout.viewport + 1);
    expect(settingsLayout.middleDots).toBe(false);
    await page.screenshot({ path: "test-results/settings-layout.png" });
});
