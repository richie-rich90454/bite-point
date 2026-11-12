import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("streams the endless world and renders exterior terrain", async ({ page }) => {
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
                renderScale: 0.6,
                shadows: false,
                audioEnabled: false,
                motionBlur: false,
            }),
        );
    });
    await page.goto("/");
    await page.locator('[data-setup-tab="drive"]').click();
    await page.locator('[data-map-card="endless-curves"]').click();
    await page.locator('[data-ui="start"]').click();
    await expect(page.locator(".start-overlay")).toBeHidden();
    await page.waitForTimeout(2500);
    const snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(snapshot.worldMode).toBe("endless");
    expect(snapshot.activeChunks).toBeGreaterThan(4);
    expect(snapshot.roadDistance).toBeGreaterThan(-50);
    const world = await page.evaluate(() => window.bitePoint!.world());
    console.log("world diagnostics", world);
    expect(world.material).toBe("endless-asphalt");
    expect(world.albedo).not.toBeNull();
    expect(world.albedoReady).toBe(true);
    await page.keyboard.press("c");
    await page.keyboard.press("c");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "test-results/endless-exterior.png" });
    expect(errors).toEqual([]);
});
