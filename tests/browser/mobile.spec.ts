import { expect, test } from "@playwright/test";

test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
});

test("offers touch driving controls on a phone-sized screen", async ({ page }) => {
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
                renderScale: 0.45,
                shadows: false,
                audioEnabled: false,
            }),
        );
    });
    await page.goto("/");
    await expect(page.locator(".start-overlay")).toBeVisible();
    await expect(page.locator(".start-shell")).toBeVisible();
    await page.locator('[data-ui="start"]').click();
    await page.waitForTimeout(1200);
    await expect(page.locator(".touch-controls")).toBeVisible();
    await expect(page.locator('[data-touch="throttle"]')).toBeVisible();

    await page.locator('[data-touch="clutchOut"]').dispatchEvent("pointerdown", {
        pointerId: 1,
        pointerType: "touch",
    });
    const throttle = page.locator('[data-touch="throttle"]');
    await throttle.dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch" });
    await page.waitForTimeout(2600);
    await throttle.dispatchEvent("pointerup", { pointerId: 2, pointerType: "touch" });
    const snapshot = await page.evaluate(() => window.bitePoint!.snapshot());
    expect(snapshot.speedKph).toBeGreaterThan(1);
    expect(errors).toEqual([]);
});
