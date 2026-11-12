import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

test("drives and turns on the open city grid", async ({ page }) => {
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
    await page.locator('[data-ui="start"]').click();
    await page.waitForTimeout(2200);
    let snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(snapshot.mapId).toBe("city-center");
    expect(snapshot.worldMode).toBe("city");
    expect(snapshot.activeChunks).toBeGreaterThan(4);

    await page.keyboard.down("w");
    await page.keyboard.down("x");
    await page.waitForTimeout(2600);
    await page.keyboard.up("x");
    snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(snapshot.speedKph).toBeGreaterThan(15);
    expect(snapshot.x).toBeGreaterThan(70);

    await page.keyboard.down("d");
    await page.waitForTimeout(1600);
    await page.keyboard.up("d");
    await page.keyboard.up("w");
    snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(Math.abs(snapshot.y + 8)).toBeGreaterThan(2);
    expect(errors).toEqual([]);
});
