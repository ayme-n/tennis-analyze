# 🎾 Tennis Match Prep

Automates what you used to do by hand: pick **Player A** and **Player B**, choose filters (surface, date range, format, indoor/outdoor), click **FETCH STATS**, and get one compact, plain-text report — with real, verifiable statistics for both players — ready to paste into an AI assistant for match analysis.

- Real data only. When no provider key is configured the app says **"Data provider not connected"** and shows nothing instead of secretly substituting samples.
- Every number traces to a provider request; cache usage and retrieval times are displayed with the data.
- The exported report is generated from the exact objects the dashboard renders — they cannot disagree.

## Selected data provider: Sportradar Tennis API v3

Chosen after verifying current official documentation (see `docs/PROVIDER-RESEARCH.md` for the full endpoint verification and field→source mapping). Alternatives were rejected for documented reasons (e.g. api-tennis.com exposes no surface field, which a surface filter cannot live without).

**Trial access is free** and requires no payment:

1. Go to <https://marketplace.sportradar.com/signup> and create an account.
2. Add the **Tennis API** trial to your account and copy the issued API key.
3. Create a file `.env.local` in the project root (next to `package.json`):

   ```bash
   SPORTRADAR_API_KEY=your_key_here
   SPORTRADAR_ACCESS_LEVEL=trial
   ```

4. Start (or restart) the server. The header badge turns green: "● Sportradar Tennis API v3".

The key is read **only server-side** and is sent only to `api.sportradar.com` in the `x-api-key` header. It never appears in browser code, network responses from this app, exported reports, or logs (see the test suite for an explicit guard).

Already paying for Sportradar production access? Set `SPORTRADAR_ACCESS_LEVEL=production`.

## Run it

```bash
npm install
npm run dev        # development, http://localhost:3000
# or production:
npm run build && npm start
```

Deploy anywhere that runs Node >= 20 (the repo includes no platform-specific config): set the same env vars and run `npm run build && npm start`. The provider cache lives in `.cache/` (writable dir required; set `CACHE_DIR` to relocate). A single process serves UI + API — no other services needed.

## Test

```bash
npm test           # vitest: aggregation math, score orientation, tiebreaks,
                   # filters, dedup+pagination, missing-vs-zero semantics,
                   # provider errors/caching, report contents (52 tests)
npm run typecheck  # tsc --noEmit
```

## What the statistics are built from (and the honest limits)

Per-match serve/pressure statistics come from raw per-match counters (aces, first serves in, second serves in/won, break points, …) and every percentage is `100 × Σnumerator / Σdenominator` across matches **with that statistic present** — never an average of per-match percentages. Matches without statistics reduce the sample size and are counted, not zeroed. Zero denominators render as **unavailable**, never as a misleading 0% or NaN. Walkovers, retirements and defaults are excluded from all aggregates and shown separately.

Documented limits, displayed in the UI and repeated in every report's LIMITATIONS section:

- **History depth: max 30 recent matches per player per fetch** (provider design). Longer requested windows are explicitly labeled *partial* with the actual covered span.
- Statistics exist only for matches with point-by-point coverage (provider tier rules; e.g. early rounds of WTA 250/125 events and ITF events often lack them). Every statistic shows its match count.
- Tournament titles/entries come from the provider's per-calendar-year aggregates, so they are unavailable when the window doesn't align with whole calendar years (or when an indoor/outdoor filter is active).
- Rankings are weekly snapshots (a "ranking date" = ranking week). Opponent ranking *at match time* is not available from this source.
- "Second serves in" is derived as `second_serve_successful + double_faults` attempts, matching the provider's documented fields; break-points-converted is derived from the opponents' documented break-point rows of the same matches. Both derivations were validated against the provider's own published sample.
- Sportradar trial quota is conservative: the app throttles to ~1 request/1.1 s, retries on 429/5xx with backoff, and caches aggressively (rankings 6 h, matches 30 min, tournament metadata 30 days). First fetch of a new player pair can take ~10–40 s; later fetches are near-instant and the provenance panel shows what came from cache.

## Demo mode

The checkbox **"Demo mode"** is an explicit opt-in that swaps in synthetic fixtures so you can click through the whole UI without an API key. Everything — header, banners, exports — is labeled **DEMO — NOT REAL MATCH DATA**. Demo data is never used otherwise, and a real-provider failure never falls back to it.

## Configuration reference (`.env.local`)

| Variable | Default | Meaning |
|---|---|---|
| `SPORTRADAR_API_KEY` | — (required for real data) | Sportradar Tennis key (server-side only) |
| `SPORTRADAR_ACCESS_LEVEL` | `trial` | `trial` or `production` |
| `SPORTRADAR_BASE_URL` | `https://api.sportradar.com/tennis` | provider base URL override |
| `SPORTRADAR_LANGUAGE` | `en` | language code path segment |
| `PROVIDER_MIN_INTERVAL_MS` | `1100` | min spacing between provider requests |
| `PROVIDER_TIMEOUT_MS` | `12000` | per-request timeout |
| `EXTRA_PLAYER_IDS` | — | comma-separated `sr:competitor:*` ids to add to player search when a player isn't in the ranking feeds |
| `CACHE_DIR` | `.cache` | where the shared provider cache is stored |

## Repository layout

```
src/lib/model.ts                     normalized types + provider contract
src/lib/stats.ts                     pure engine: surfaces, scores, filters, aggregation (unit-tested)
src/lib/report.ts                    copy-for-AI text report builder (unit-tested)
src/lib/cache.ts                     TTL cache (memory + .cache/, stale-if-error)
src/lib/service.ts                   orchestration + API payload assembly
src/lib/providers/sportradar/        verified Sportradar adapter (client + normalizers)
src/lib/providers/demo.ts            synthetic demo provider (labeled)
src/app/                             Next.js UI dashboard + API routes
test/                                vitest suites incl. fixtures from official docs samples
docs/PROVIDER-RESEARCH.md            provider verification + field→source mapping
```

Not built on purpose (per project scope): no accounts, no payments, no betting/odds, no AI prediction engine — the report ends with an analysis *request* you paste to an AI assistant.
