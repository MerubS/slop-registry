import { mapWithConcurrency } from './pool';

describe('mapWithConcurrency', () => {
  it('never runs more workers than the limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const seen: number[] = [];

    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      seen.push(item);
      inFlight -= 1;
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
});
