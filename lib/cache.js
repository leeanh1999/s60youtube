'use strict';

/** Bo nho dem don gian theo TTL, gioi han so phan tu. */
class TtlCache {
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Dua len cuoi de LRU hoat dong.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  delete(key) {
    this.map.delete(key);
  }

  set(key, value, ttlMs) {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  }

  /** Chay fn mot lan cho moi key; cac loi goi trung nhau dung chung Promise. */
  async wrap(key, ttlMs, fn) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const pending = fn().catch((err) => {
      this.map.delete(key);
      throw err;
    });
    this.set(key, pending, ttlMs);
    return pending;
  }
}

module.exports = { TtlCache };
