import { describe, expect, it } from 'vitest';

describe('smoke', () => {
  it('runs a test with the shared toolchain', () => {
    expect(1 + 1).toBe(2);
  });
});
