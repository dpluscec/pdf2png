import { describe, it, expect } from 'vitest';
import { accumulateRotation } from '../src/lib/rotateUtils';

describe('accumulateRotation', () => {
  it('adds 90 degrees', () => {
    expect(accumulateRotation(0, 90)).toBe(90);
    expect(accumulateRotation(90, 90)).toBe(180);
    expect(accumulateRotation(180, 90)).toBe(270);
  });

  it('wraps from 270 to 0 when adding 90', () => {
    expect(accumulateRotation(270, 90)).toBe(0);
  });

  it('subtracts 90 degrees', () => {
    expect(accumulateRotation(90, -90)).toBe(0);
    expect(accumulateRotation(180, -90)).toBe(90);
    expect(accumulateRotation(270, -90)).toBe(180);
  });

  it('wraps from 0 to 270 when subtracting 90', () => {
    expect(accumulateRotation(0, -90)).toBe(270);
  });
});
