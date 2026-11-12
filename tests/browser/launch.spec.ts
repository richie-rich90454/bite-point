import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

test("guides a launch-control start from armed to moving", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(() => {
        localStorage.setItem(
            "bite-point.settings.v2",
            JSON.stringify({
                version: 2,
                quality: "low",
                renderScale: 0.5,
                shadows: false,
                audioEnabled: false,
            }),
        );
    });

    await page.goto("/");
    await page.locator('[data-setup-tab="drive"]').click();
    await page.locator('[data-scenario-card="launch-control"]').click();
    await page.locator('[data-ui="start"]').click();
    await page.waitForTimeout(900);
    await expect(page.locator(".scenario-title")).toHaveText("Launch control tutorial");

    await page.keyboard.down("s");
    await page.keyboard.down("w");
    await expect
        .poll(
            async () => {
                const state = await page.evaluate(() => window.bitePoint!.snapshot());
                return state.launchControlPhase;
            },
            { timeout: 15_000, intervals: [300, 600] },
        )
        .toBe("holding");

    const held = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(held.launchControlActive).toBe(true);
    expect(held.rpm).toBeGreaterThan(2500);
    expect(held.speedKph).toBeLessThan(1.5);
    await expect(page.locator(".scenario-message")).toContainText("Release the brake");

    await page.keyboard.up("s");
    await expect
        .poll(
            async () => {
                const state = await page.evaluate(() => window.bitePoint!.snapshot());
                return state.speedKph;
            },
            { timeout: 20_000, intervals: [300, 600] },
        )
        .toBeGreaterThan(10);
    const launched = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(launched.running).toBe(true);
    expect(launched.gear).toBe(1);
    await page.keyboard.up("w");
    expect(errors).toEqual([]);
});
