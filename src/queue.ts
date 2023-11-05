class Queue<T> {
    private readonly maxSize: number;

    private items: T[];

    constructor(maxSize: number) {
        this.maxSize = maxSize;
        this.items = [];
    }

    public push(...items: T[]): void {
        this.items = [...items, ...this.items].slice(0, this.maxSize);
    }

    public pop(): T | undefined {
        return this.items.pop();
    }

    public getItems(): T[] {
        return this.items;
    }

    public getSize(): number {
        return this.items.length;
    }

    public isFull(): boolean {
        return this.items.length == this.maxSize;
    }
}

export default Queue;
