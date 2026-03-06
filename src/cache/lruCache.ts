/**
 * LRU缓存实现
 */

export class LRUCache<K, V> {
  private map = new Map<K, V>();

  constructor(private maxSize: number) {}

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
      }
    }
    this.map.set(key, value);
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // 移动到最新
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  deleteWhere(predicate: (key: K) => boolean): void {
    for (const key of [...this.map.keys()]) {
      if (predicate(key)) {
        this.map.delete(key);
      }
    }
  }

  get size(): number {
    return this.map.size;
  }
}
