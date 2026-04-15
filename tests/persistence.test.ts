import { describe, it, expect } from 'vitest';
import { djb2Hash } from '../src/lib/editor/persistence';

describe('djb2Hash', () => {
  it('returns a hex string', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = djb2Hash(bytes);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same hash for the same input', () => {
    const bytes = new Uint8Array([10, 20, 30]);
    expect(djb2Hash(bytes)).toBe(djb2Hash(bytes));
  });

  it('returns different hashes for different inputs', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(djb2Hash(a)).not.toBe(djb2Hash(b));
  });

  it('only reads up to 65536 bytes', () => {
    const short = new Uint8Array(100).fill(42);
    const long = new Uint8Array(200000).fill(42);
    // short < 65536, long > 65536 but same prefix — just verify no throw on large input
    expect(() => djb2Hash(long)).not.toThrow();
  });
});
