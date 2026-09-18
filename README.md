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

The key is read **only server-side** and is sent only to `api.sportradar.com` in the `x-api-key` header. It never appears in browser code, network responses from this app, exported reports, or logs (see the test suite for an explicit guard). The one deliberate exception: `GET /api/status` returns a short **mask** of the configured key (first/last 4 chars + length, e.g. `abcd…wxyz (32 chars)`) so deployments can be verified without ever exposing the key itself.

Already paying for Sportradar production access? Set `SPORTRADAR_ACCESS_LEVEL=production`.

**Zero-config deployments:** a free-trial fallback key is embedded in `src/lib/providers/sportradar/index.ts`, so the app works out of the box with no env vars at all (e.g. on Vercel without any configuration). A `SPORTRADAR_API_KEY` env var always takes precedence when set, and `SPORTRADAR_DISABLE_EMBEDDED_KEY=1` turns the fallback off. Note the embedded key is visible in this repository — fine for a free trial key; rotate it in the Sportradar marketplace if it's ever abused.

## Troubleshooting: "Provider rejected the API key (HTTP 403)"

A 403 means your deployment *is* sending a key to `api.sportradar.com`, but Sportradar refuses it. Work through these in order:

1. **Verify what the deployment actually has.** Click **🔍 Test API key** in the app header (or open `GET /api/status?probe=1`). It shows the masked key, the access level, and the exact endpoint, then fires one live request and tells you how Sportradar responded. Compare the mask against the key in your dashboard — a mismatch means the env var wasn't picked up or the wrong key was pasted.
2. **Use the Tennis subscription's key.** Sportradar issues a separate key per API product. Signing up is not enough — in the marketplace you must add the **Tennis API trial**, then copy the key shown *for that subscription*.
3. **Match the access level.** Trial keys only work with `SPORTRADAR_ACCESS_LEVEL=trial` (the default); production keys need `production`.
4. **No stray characters.** Paste the key bare — no quotes, spaces, or newlines. (The app strips whitespace and wrapping quotes defensively, but a corrupted copy is a common cause.)
5. **Vercel specifics.** Add the vars under *Project Settings → Environment Variables* for the right scope (Production/Preview), then **create a new deployment** — env vars are injected at deploy time, so the previous deployment keeps running without them.
6. **HTTP 429 instead of 403?** The key is accepted but the trial quota is exhausted; it resets automatically after the quota window.

## Troubleshooting: search finds no players (even famous ones)

Player search works against the cached ATP/WTA rankings directory. If every name returns nothing:

1. Click **🧹 Clear cache & re-test** in the header. It drops all cached provider data and runs a fresh live probe that also reports how many players were parsed from the rankings feed:
   - `Player directory: N (>0) players ✓` → the feed is healthy; the name you typed is simply not in the current ATP/WTA rankings (try the full or last name; players outside the ranking feeds can be added via `EXTRA_PLAYER_IDS`).
   - `Player directory: 0 players ✗` → the provider answered, but the payload didn't parse into players; the reported top-level keys pinpoint the shape mismatch.
   - `HTTP 403` → see the section above.
2. You can also open `GET /api/players/search?q=sinner&debug=1` directly — it returns the directory size and sample names alongside the results.
3. Empty rankings responses are never cached, so a one-off bad response can no longer lock the search into "no players found" for hours.

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
