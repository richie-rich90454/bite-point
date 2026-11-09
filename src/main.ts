import { SimulatorApplication } from "./app/SimulatorApplication";

async function boot(): Promise<void> {
    await document.fonts.ready.catch(() => undefined);
    const canvas = document.getElementById("render-canvas");
    const uiRoot = document.getElementById("ui-root");
    const errorElement = document.getElementById("boot-error");
    if (!(canvas instanceof HTMLCanvasElement) || !(uiRoot instanceof HTMLElement)) {
        throw new Error("Application markup is incomplete.");
    }
    try {
        const app = new SimulatorApplication(canvas, uiRoot);
        app.start();
        window.addEventListener("error", (event) => {
            console.error(event.error);
        });
        window.addEventListener("unhandledrejection", (event) => {
            console.error(event.reason);
        });
    } catch (error) {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
        if (errorElement) {
            errorElement.hidden = false;
            errorElement.textContent = `Bite Point could not start.\n\n${message}\n\nCheck the vehicle configuration and WebGL support, then reload.`;
        }
        console.error(error);
    }
}

void boot();
