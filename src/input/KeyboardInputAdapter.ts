import { findBindingOwner, type BindingMap, type InputAction } from "./bindings";

export interface KeyboardAdapterCallbacks {
    onActionDown: (action: InputAction) => void;
    onActionUp: (action: InputAction) => void;
    onFocusLost: () => void;
    onVisibilityHidden: () => void;
}

const PREVENT_DEFAULT_CODES = new Set([
    "Space",
    "Tab",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Backspace",
    "F1",
    "F2",
    "Home",
    "Enter",
]);

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isUiActivationTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.closest("button, a, [role='button']") !== null;
}

export class KeyboardInputAdapter {
    private bindings: BindingMap;
    private readonly pressedCodes = new Set<string>();
    private readonly actionCodes = new Map<InputAction, Set<string>>();
    private captureCallback: ((code: string) => void) | null = null;
    private disposed = false;

    constructor(
        private readonly target: Window,
        bindings: BindingMap,
        private readonly callbacks: KeyboardAdapterCallbacks,
    ) {
        this.bindings = bindings;
        this.rebuildActionCodes();
        target.addEventListener("keydown", this.handleKeyDown);
        target.addEventListener("keyup", this.handleKeyUp);
        target.addEventListener("blur", this.handleBlur);
        this.target.document.addEventListener("visibilitychange", this.handleVisibility);
    }

    setBindings(bindings: BindingMap): void {
        this.bindings = bindings;
        this.rebuildActionCodes();
    }

    getPressedCodes(): string[] {
        return [...this.pressedCodes];
    }

    isCodeDown(code: string): boolean {
        return this.pressedCodes.has(code);
    }

    captureNext(callback: (code: string) => void): void {
        this.captureCallback = callback;
    }

    cancelCapture(): void {
        this.captureCallback = null;
    }

    clearAll(): void {
        const actions = new Set<InputAction>();
        for (const code of this.pressedCodes) {
            const action = findBindingOwner(this.bindings, code);
            if (action) actions.add(action);
        }
        this.pressedCodes.clear();
        for (const action of actions) this.callbacks.onActionUp(action);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.target.removeEventListener("keydown", this.handleKeyDown);
        this.target.removeEventListener("keyup", this.handleKeyUp);
        this.target.removeEventListener("blur", this.handleBlur);
        this.target.document.removeEventListener("visibilitychange", this.handleVisibility);
    }

    private rebuildActionCodes(): void {
        this.actionCodes.clear();
        for (const [action, codes] of Object.entries(this.bindings) as Array<
            [InputAction, string[]]
        >) {
            for (const code of codes) {
                let set = this.actionCodes.get(action);
                if (!set) {
                    set = new Set();
                    this.actionCodes.set(action, set);
                }
                set.add(code);
            }
        }
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (this.captureCallback) {
            event.preventDefault();
            const callback = this.captureCallback;
            this.captureCallback = null;
            callback(event.code);
            return;
        }
        if (isEditableTarget(event.target)) return;
        if (
            isUiActivationTarget(event.target) &&
            (event.code === "Enter" || event.code === "Space")
        )
            return;

        const code = event.code;
        const action = findBindingOwner(this.bindings, code);
        const shouldPrevent = action !== null || PREVENT_DEFAULT_CODES.has(code);
        if (shouldPrevent) event.preventDefault();

        const alreadyDown = this.pressedCodes.has(code);
        this.pressedCodes.add(code);
        if (alreadyDown || action === null) return;
        if (!event.repeat) this.callbacks.onActionDown(action);
    };

    private handleKeyUp = (event: KeyboardEvent): void => {
        if (this.captureCallback) return;
        const code = event.code;
        if (!this.pressedCodes.has(code)) return;
        this.pressedCodes.delete(code);
        if (isEditableTarget(event.target)) return;
        const action = findBindingOwner(this.bindings, code);
        if (action === null) return;
        const codes = this.actionCodes.get(action);
        const stillDown = codes
            ? [...codes].some((candidate) => this.pressedCodes.has(candidate))
            : false;
        if (!stillDown) this.callbacks.onActionUp(action);
    };

    private handleBlur = (): void => {
        this.clearAll();
        this.callbacks.onFocusLost();
    };

    private handleVisibility = (): void => {
        if (this.target.document.visibilityState === "hidden") {
            this.clearAll();
            this.callbacks.onVisibilityHidden();
        }
    };
}

export async function loadKeyLabelMap(): Promise<Map<string, string>> {
    const keyboard = (
        navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }
    ).keyboard;
    if (!keyboard?.getLayoutMap) return new Map();
    try {
        return await keyboard.getLayoutMap();
    } catch {
        return new Map();
    }
}
