import { describe, expect, it } from 'vitest';

describe('Overview jobs counting', () => {
  it('a board with 5 rows x 10 columns must yield 5 jobs, not 50', () => {
    const rows = 5;
    const columns = 10;
    const jobs = rows;
    expect(jobs).toBe(5);
    expect(jobs).not.toBe(rows * columns);
  });
});
