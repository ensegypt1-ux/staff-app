/**
 * Local fan-out benchmark (no network, no deploy).
 *
 * Simulates the soft-404 orders path call pattern before/after the
 * pending table-calls dedupe, and request-scoped GET coalescing.
 *
 * Usage: node scripts/bench-orders-upstream.mjs
 */
function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
}

function simulate({ coalesce, dedupePendingCount }) {
  let upstream = 0;
  const cache = new Map();
  const sleep = (ms) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      /* busy wait for tiny deterministic delay */
    }
  };

  async function get(path, latencyMs) {
    if (coalesce && cache.has(path)) return cache.get(path);
    upstream += 1;
    sleep(latencyMs);
    const result = { path, ok: true };
    if (coalesce) cache.set(path, result);
    return result;
  }

  const started = Date.now();
  // Soft-404 fallback shape
  const pendingPromise = get('staff-auth/table-calls', 90);
  const historyPromise = get('staff-auth/table-calls/history', 80);
  if (!dedupePendingCount) {
    // old: third parallel fetch of the same pending list
    void get('staff-auth/table-calls', 90);
  }
  return Promise.all([pendingPromise, historyPromise]).then(() => {
    // happy-path extras that used to re-hit table-calls
    return Promise.all([
      get('staff-auth/me', 70),
      get('staff-auth/table-calls', 90), // hydrate
      get('staff-auth/table-calls', 90), // service merge
    ]).then(() => ({
      upstream,
      ms: Date.now() - started,
    }));
  });
}

async function run() {
  const beforeSamples = [];
  const afterSamples = [];
  for (let i = 0; i < 30; i++) {
    beforeSamples.push(
      await simulate({ coalesce: false, dedupePendingCount: false }),
    );
    afterSamples.push(
      await simulate({ coalesce: true, dedupePendingCount: true }),
    );
  }

  const summarize = (label, samples) => {
    const ups = samples.map((s) => s.upstream);
    const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
    const avgMs = ms.reduce((a, b) => a + b, 0) / ms.length;
    console.log(
      `${label}: upstream_calls=${ups[0]} (stable) avg_ms=${avgMs.toFixed(1)} p95_ms=${percentile(ms, 0.95)}`,
    );
  };

  console.log('Local synthetic orders fan-out benchmark (no Express)');
  summarize('BEFORE', beforeSamples);
  summarize('AFTER ', afterSamples);
  console.log(
    `Upstream reduction: ${beforeSamples[0].upstream} → ${afterSamples[0].upstream} (` +
      `${(((beforeSamples[0].upstream - afterSamples[0].upstream) / beforeSamples[0].upstream) * 100).toFixed(0)}% fewer)`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
