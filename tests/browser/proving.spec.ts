import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1024, height: 600 } });

test("selects the proving lesson and uses sans-serif instruments", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem(
            "bite-point.settings.v2",
            JSON.stringify({
                quality: "low",
                renderScale: 0.5,
                shadows: false,
                audioEnabled: false,
            }),
        );
    });
    await page.goto("/");
    await expect(page.locator(".start-overlay")).toBeVisible();
    const font = await page
        .locator("h1")
        .evaluate((element) => getComputedStyle(element).fontFamily);
    expect(font).toContain("Noto Sans");
    expect(font).not.toMatch(/Georgia|Bodoni|Didot|Palatino|Baskerville/);
    await page.locator('[data-setup-tab="drive"]').click();
    await page.locator('[data-map-card="proving-ground"]').click();
    await page.locator('[data-scenario-card="proving-run"]').click();
    await page.locator('[data-ui="start"]').click();
    await expect(page.locator(".scenario-title")).toHaveText("Six gears, 200 km/h");
    const state = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(state.scenarioId).toBe("proving-run");
    expect(state.gear).toBe(1);
    expect(state.y).toBeCloseTo(-114.5);
    expect(state.running).toBe(true);
    await page.keyboard.press("c");
    await page.keyboard.press("c");
    await expect(page.locator(".exterior-instruments")).toBeVisible();
    await expect(page.locator("[data-exterior-gear]")).toHaveText("1");
    await page.keyboard.press("Escape");
    await page.locator('[data-tab="lessons"]').click();
    await expect(page.locator(".lesson-title")).toContainText(["Six gears, 200 km/h"]);
    expect(errors).toEqual([]);
});
