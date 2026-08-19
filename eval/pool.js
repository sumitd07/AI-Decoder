'use strict';
// Bounded-concurrency map. The eval's rows are independent — nothing in row 7
// depends on row 6 — so running them one at a time turned a one-minute job into
// ten. Results come back in input order regardless of completion order, which is
// what keeps the saved file diffable between runs.
//
// The bound exists because the provider rate-limits: unbounded Promise.all on 39
// rows trips 429s and the retries cost more than the concurrency saved.
async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// Concurrency is env-tunable because the right number depends on the key's tier:
// a free key wants 1-2, a paid key handles 8 comfortably.
function poolSize(envVar, fallback = 6) {
  const n = Number(process.env[envVar]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

module.exports = { mapWithConcurrency, poolSize };
