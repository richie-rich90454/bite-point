import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

const TERRAIN: Record<string, string> = {
    "city-center": "terrain-city",
    "industrial-district": "terrain-industrial",
    "coastal-highway": "terrain-coast",
    "alpine-pass": "terrain-mountain",
    "forest-run": "terrain-forest",
    "tunnel-run": "terrain-tunnel",
    "bridge-crossing": "terrain-bridge",
    summit: "terrain-mountain",
    "endless-straight": "terrain-proving",
    "endless-curves": "terrain-coast",
    "world-tour": "terrain-city",
};

async function checkMaps(page: Page, mapIds: string[]): Promise<void> {
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

    for (const mapId of mapIds) {
        await page.locator(`[data-map-card="${mapId}"]`).click();
        await page.locator('[data-setup-tab="session"]').click();
        await page.locator('[data-scenario-card="endless"]').click();
        await page.locator('[data-ui="start"]').click();
        await page.waitForTimeout(700);

        const snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
        const world = await page.evaluate(() => window.bitePoint!.world());
        expect(snapshot.mapId).toBe(mapId);
        expect(snapshot.activeChunks).toBeGreaterThan(2);
        expect(world.terrainMaterial).toBe(TERRAIN[mapId]);
        expect(errors).toEqual([]);

        await page.keyboard.press("Escape");
        await page.waitForTimeout(150);
        await page.locator('[data-ui="garage"]').click();
        await page.waitForTimeout(150);
        await page.locator('[data-setup-tab="map"]').click();
    }
    expect(errors).toEqual([]);
}

test("starts the city, industrial, coastal, alpine and forest maps", async ({ page }) => {
    test.setTimeout(300_000);
    await checkMaps(page, [
        "city-center",
        "industrial-district",
        "coastal-highway",
        "alpine-pass",
        "forest-run",
    ]);
});

test("starts the tunnel, bridge, summit, straight, curves and world tour maps", async ({
    page,
}) => {
    test.setTimeout(300_000);
    await checkMaps(page, [
        "tunnel-run",
        "bridge-crossing",
        "summit",
        "endless-straight",
        "endless-curves",
        "world-tour",
    ]);
});
