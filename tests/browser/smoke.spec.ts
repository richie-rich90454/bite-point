import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1024, height: 600 } });

test("boots, starts a session, launches and shifts", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(() => {
        localStorage.setItem(
            "bite-point.settings.v1",
            JSON.stringify({
                version: 1,
                renderScale: 0.45,
                shadows: false,
                quality: "low",
                audioEnabled: false,
            }),
        );
    });

    await page.goto("/");
    await expect(page.locator("#boot-error")).toBeHidden();
    await expect(page.locator(".start-overlay")).toBeVisible();
    await expect(page.locator("h1")).toContainText("BITE");

    await page.locator('[data-ui="start"]').click();
    await expect(page.locator(".start-overlay")).toBeHidden();
    await expect(page.locator(".hud")).not.toHaveClass(/hud-hidden/);

    await page.waitForTimeout(400);
    let snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(snapshot.started).toBe(true);
    expect(snapshot.scenarioId).toBe("free-drive");

    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(snapshot.gear).toBe(1);

    await page.keyboard.down("w");
    await page.waitForTimeout(500);
    await page.keyboard.down("x");
    await page.waitForTimeout(700);
    await page.keyboard.up("x");
    await expect
        .poll(
            async () => {
                const current = await page.evaluate(() => window.bitePoint!.snapshot());
                return current.speedKph;
            },
            { timeout: 20_000, intervals: [400, 800] },
        )
        .toBeGreaterThan(3);
    snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(snapshot.running).toBe(true);

    const beforeSteer = snapshot;
    await page.keyboard.down("d");
    await page.waitForTimeout(900);
    await page.keyboard.up("d");
    snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(Math.abs(snapshot.y - beforeSteer.y)).toBeGreaterThan(0.02);

    await page.keyboard.down("z");
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(snapshot.gear).toBe(2);

    await page.screenshot({ path: "test-results/driving.png" });

    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeVisible();
    await page.screenshot({ path: "test-results/pause.png" });

    await page.locator('[data-tab="input"]').click();
    await expect(page.locator(".input-test-content, .held-keys")).toBeVisible();
    await page.locator('[data-tab="settings"]').click();
    await expect(page.locator('[data-setting="masterVolume"]')).toBeVisible();
    await page.locator('[data-tab="drive"]').click();
    await page.locator('[data-ui="resume"]').click();
    await expect(page.locator(".pause-overlay")).toBeHidden();

    await page.keyboard.press("Tab");
    await expect(page.locator(".telemetry-panel")).toBeVisible();
    await page.locator('[data-ui="export"]').click();
    await page.locator('[data-ui="replay"]').click();
    await page.waitForTimeout(500);
    snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(snapshot.replaying).toBe(true);
    await page.locator('[data-ui="replay"]').click();
    await page.waitForTimeout(300);

    expect(errors).toEqual([]);
});
