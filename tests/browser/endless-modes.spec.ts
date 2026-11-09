import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

test("switches between the curved and straight endless modes", async ({ page }) => {
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
            }),
        );
    });

    await page.goto("/");
    await page.locator('[data-scenario-card="endless-straight"]').click();
    await page.locator('[data-ui="start"]').click();
    await page.waitForTimeout(1500);

    let snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(snapshot.scenarioId).toBe("endless-straight");
    expect(snapshot.worldMode).toBe("endless");
    expect(snapshot.activeChunks).toBeGreaterThan(3);
    expect(Math.abs(snapshot.y)).toBeLessThan(0.25);

    await page.evaluate(() => window.bitePoint!.startScenario("endless"));
    await page.waitForTimeout(1500);
    snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(snapshot.scenarioId).toBe("endless");
    expect(snapshot.worldMode).toBe("endless");
    expect(snapshot.activeChunks).toBeGreaterThan(3);
    expect(errors).toEqual([]);
});
