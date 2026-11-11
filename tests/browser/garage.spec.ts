import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("selects a car and map and applies them to the session", async ({ page }) => {
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
    await expect(page.locator(".start-overlay")).toBeVisible();
    await expect(page.locator('[data-setup-tab="car"]')).toHaveClass(/active/);
    await expect(page.locator("[data-car-card]").first()).toBeVisible();

    await page.locator('[data-car-card="commuter-16-6mt"]').click();
    await expect(page.locator(".setup-summary")).toContainText("1.6 commuter");

    await page.locator('[data-setup-tab="map"]').click();
    await expect(page.locator("[data-map-card]").first()).toBeVisible();
    await page.locator('[data-map-card="forest-run"]').click();
    await expect(page.locator(".setup-summary")).toContainText("Forest Run");

    await page.locator('[data-setup-tab="session"]').click();
    await page.locator('[data-scenario-card="endless"]').click();
    await page.locator('[data-ui="start"]').click();
    await page.waitForTimeout(1800);

    const snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    const debug = await page.evaluate(() => window.bitePoint!.debug());
    expect(snapshot.carId).toBe("commuter-16-6mt");
    expect(snapshot.mapId).toBe("forest-run");
    expect(snapshot.worldMode).toBe("endless");
    expect(snapshot.activeChunks).toBeGreaterThan(3);
    expect(debug.cameraMode).toBe("cockpit");
    expect(debug.cockpitEnabled).toBe(true);
    expect(debug.cockpitVisible).toBeGreaterThan(20);
    expect(debug.importedCar).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: "test-results/garage.png" });
});
