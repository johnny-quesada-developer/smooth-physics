// Values of a key come back newest first and sets iterate in insertion order: results depend on both orders.
export class MultiMap<Key, Value> {
  private readonly entries = new Map<Key, Value[]>();

  add(key: Key, value: Value): void {
    const list = this.entries.get(key);
    if (list) list.push(value);
    else this.entries.set(key, [value]);
  }

  addUnique(key: Key, value: Value): void {
    const list = this.entries.get(key);
    if (!list || !list.includes(value)) this.add(key, value);
  }

  has(key: Key): boolean {
    return this.entries.has(key);
  }

  count(key: Key): number {
    return this.entries.get(key)?.length ?? 0;
  }

  values(key: Key): Value[] {
    const list = this.entries.get(key);
    return list ? [...list].reverse() : [];
  }

  keys(): IterableIterator<Key> {
    return this.entries.keys();
  }
}

export type Pair = [number, number];
export type Triangle = [number, number, number];

export const sortedPair = (first: number, second: number): Pair => (first < second ? [first, second] : [second, first]);
export const pairKey = (first: number, second: number): string => (first < second ? `${first},${second}` : `${second},${first}`);
export function sortedTriangle(first: number, second: number, third: number): Triangle {
  const sorted = [first, second, third].sort((left, right) => left - right);
  return [sorted[0], sorted[1], sorted[2]];
}
export const triangleKey = (triangle: Triangle): string => triangle.join(',');
