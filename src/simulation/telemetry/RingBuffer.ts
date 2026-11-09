export class RingBuffer<T> {
    private readonly values: Array<T | undefined>;
    private head = 0;
    private count = 0;

    constructor(readonly capacity: number) {
        if (!Number.isInteger(capacity) || capacity < 1)
            throw new Error("RingBuffer capacity must be a positive integer.");
        this.values = new Array<T | undefined>(capacity);
    }

    push(value: T): void {
        this.values[this.head] = value;
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity) this.count += 1;
    }

    get size(): number {
        return this.count;
    }

    latest(): T | undefined {
        if (this.count === 0) return undefined;
        return this.values[(this.head - 1 + this.capacity) % this.capacity];
    }

    toArray(): T[] {
        const result: T[] = [];
        const start = (this.head - this.count + this.capacity) % this.capacity;
        for (let i = 0; i < this.count; i += 1) {
            result.push(this.values[(start + i) % this.capacity] as T);
        }
        return result;
    }

    clear(): void {
        this.head = 0;
        this.count = 0;
        this.values.fill(undefined);
    }
}
