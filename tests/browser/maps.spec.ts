import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

const MAPS = [
    "city-center",
    "industrial-district",
    "coastal-highway",
    "alpine-pass",
    "forest-run",
    "tunnel-run",
    "bridge-crossing",
    "summit",
    "endless-straight",
    "endless-curves",
    "world-tour",
];

test("starts every map without runtime errors", async ({ page }) => {
    test.setTimeout(300_000);
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
    await page.locator('[data-setup-tab="map"]').click();

    for (const mapId of MAPS) {
        await page.locator(`[data-map-card="${mapId}"]`).click();
        await page.locator('[data-setup-tab="session"]').click();
        await page.locator('[data-scenario-card="endless"]').click();
        await page.locator('[data-ui="start"]').click();
        await page.waitForTimeout(700);

        const snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
        expect(snapshot.mapId).toBe(mapId);
        expect(snapshot.activeChunks).toBeGreaterThan(2);
        expect(errors).toEqual([]);

        await page.keyboard.press("Escape");
        await page.waitForTimeout(150);
        await page.locator('[data-ui="garage"]').click();
        await page.waitForTimeout(150);
        await page.locator('[data-setup-tab="map"]').click();
    }
});
