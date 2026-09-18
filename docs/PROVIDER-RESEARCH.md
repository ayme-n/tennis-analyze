# Provider research and field-to-source mapping

Date verified: 2026-09-18. All claims below were checked against current official documentation, not marketing pages.

## Providers evaluated

### API Tennis (api-tennis.com)
Docs: https://api-tennis.com/documentation (Tennis API v2.9.5)

- Has `get_players`, `get_standings` (rankings), `get_fixtures` with `player_key`, `get_H2H`, inline per-match `statistics` with **raw numerators/denominators** (`stat_won`, `stat_total`), and set `scores`. Doubles and singles events are mixed in responses and must be filtered by `event_type_type` ("Atp Singles", "Wta Singles", ...).
- **No surface field appears anywhere in the documented fixture/standing/player responses** (verified by reading all documented response shapes). The core requirement of this app is a surface filter, so api-tennis.com cannot power it without inventing data.
- Access is paid (free trial), API key via `APIkey` query param.

### Sportradar Tennis API v3 (trial access level) — SELECTED
Docs index: https://developer.sportradar.com/tennis/llms.txt
API reference: https://developer.sportradar.com/tennis/reference/llms.txt
Terms: trial keys are issued free via https://marketplace.sportradar.com/signup ("Add Trial"). Trial = reduced quota, same functional endpoints (`{access_level}` path segment = `trial`). Production keys can be dropped in by changing env vars.

Verified endpoints (base `https://api.sportradar.com/tennis/{access_level}/v3/{language_code}`, auth header `x-api-key`, JSON via `.json`):

| Purpose | Endpoint (verified path) | Verified response facts |
|---|---|---|
| Rankings + player directory | `GET .../rankings.json` | `rankings[]` per tour (`name: ATP/WTA`, `gender`, `week`, `year`), entries `competitor_rankings[]` = `rank, movement, points, competitions_played, competitor:{id,name,country,country_code,abbreviation}`. Updated weekly (Mondays). Ranking date reported as week+year. |
| Profile + career/year aggregates | `GET .../competitors/{id}/profile.json` | `competitor` (name/country/gender), `info` (dob, handedness, highest rankings+dates), `competitor_rankings[]` (`rank,type:singles/doubles,race_ranking`), `periods[]` → per-`year`, per-`surface`: `competitions_played, competitions_won, matches_played, matches_won`. Surface enum: `hard_court, grass, red_clay, green_clay, hardcourt_outdoor, carpet_indoor, synthetic_indoor, synthetic_outdoor, hardcourt_indoor, red_clay_indoor, unknown, synthetic_grass`. |
| Recent matches (last **30** completed) + upcoming | `GET .../competitors/{id}/summaries.json` | Per summary: `sport_event.id,start_time,start_time_confirmed`, `sport_event_context.competition{type:singles/doubles,level,gender,name}`, `season.id`, `stage.phase` (e.g. `qualification`), `round.name`, `mode.best_of`; `sport_event_status{status,match_status,winner_id,winning_reason,period_scores[{home_score,away_score,home_tiebreak_score,away_tiebreak_score,number,type}]}`; per-competitor `statistics` (both players). **Hard limit: 30 most recent completed events — history beyond that is unavailable from this endpoint.** |
| Head-to-head | `GET .../competitors/{id1}/versus/{id2}/summaries.json` | Past + upcoming matches between two competitors, same shapes as summaries. |
| Surface per match | `GET .../seasons/{season_id}/info.json` | `season.info.surface` — e.g. `"grass"`, `"hardcourt_outdoor"`, `"red_clay"`; indoor variants encode indoor/outdoor. One call per unique season; static, cached aggressively. |
| Upcoming matches (selector) | `GET .../schedules/{yyyy-mm-dd}/summaries.json` | All matches for a day; paginated with `&start=0,200,...` (200 per page per FAQ). Same summary shapes. |

Verified match statistics per competitor per match (standard stats; extended adds winners/errors):

`aces, double_faults, first_serve_successful, first_serve_points_won, second_serve_successful, second_serve_points_won, breakpoints_won, total_breakpoints, games_won, points_won` (extended adds `service_games_won, service_points_won, service_points_lost, tiebreaks_won, *_winners/errors`).

Stats are only present when the match had point-by-point coverage (per-coverage-tier matrix; `coverage.sport_event_properties` flags). Matches without stats contribute **zero** to stat denominators and are counted as "no stats" (never silently treated as zeros).

**Important semantic note**: Sportradar does not spell out whose perspective `breakpoints_won/total_breakpoints` use. Cross-checking the official docs' own sample (a Sinner–Zverev match: Sinner `breakpoints_won:2, total_breakpoints:5, service_games_won:22, games_won:25`) against the identity `games_won = service_games_won + return_games_won` and `return_games_won = opponent_breakpoints_faced - opponent_breakpoints_won` confirms the **server perspective**: `total_breakpoints` = break points faced on own serve, `breakpoints_won` = saved. Break points *converted* (returner view) are therefore derived from the opponent's numbers in the same match. This assumption is stated in the report limitations.

## Derived formulas (raw counts only, aggregated by summing)

- Total service points `SP = first_serve_successful + second_serve_successful + double_faults`
- First serves in % = `first_serve_successful / SP`
- First-serve points won % = `first_serve_points_won / first_serve_successful`
- Second serves in % = `second_serve_successful / (second_serve_successful + double_faults)`
- Second-serve points won % = `second_serve_points_won / (second_serve_successful + double_faults)`
- Break points saved % = `breakpoints_won / total_breakpoints` (server view)
- Break points converted % (returner view) = `Σ(opp.total_breakpoints - opp.breakpoints_won) / Σ(opp.total_breakpoints)`
- Return points won % = `(points_won - (first_serve_points_won + second_serve_points_won)) / (points_won + opp_points_won - SP)`
- Service games held % = `service_games_won / (service_games_won + total_breakpoints - breakpoints_won)` — extended stats only
- Return games won % = opponent breaks converted / opponent service games played (extended stats on the opponent's row)
- Tiebreaks won/played = derived from `period_scores` (a set decided by tiebreak has tiebreak scores recorded; a deciding match tiebreak period is handled as its own entity)
- Aces / double faults per match = mean over matches **with statistics present**
- Matches won/played & tournaments won/entered = counted from the match list (exact window) plus provider per-year/per-surface aggregates from the profile when the window covers whole calendar years

## Field → source mapping (requested field: supported?)

| Requested | Source | Status |
|---|---|---|
| Player search/autocomplete w/ stable IDs | `rankings.json` (IDs `sr:competitor:*`), + upcoming-schedule players | Supported (directory = ranked singles players; name-only matching never used) |
| Surface filter (Hard/Clay/Grass/All) | `season.info.surface` per match | Supported; `unknown`/carpet etc. are excluded from surface-specific totals and disclosed |
| Indoor/outdoor filter | indoor suffix variants in surface enum | Partially supported (values like `grass`/`hard_court` don't encode it → such matches are "unknown", excluded + disclosed) |
| Date ranges | client-side over `start_time` UTC | Supported; history depth limited to 30 recent matches/player (disclosed as partial) |
| Match format (bo3/bo5) | `mode.best_of` | Supported |
| Matches won/played + % | match list (+ profile aggregates for whole years) | Supported |
| Tournaments won/entered | profile `periods[].statistics` (per year+surface) | Supported for whole-calendar-year windows only; otherwise marked unavailable |
| Ranking + ranking date | `rankings.json` (`rank`, `week`, `year`) + profile fallback | Supported (weekly granularity, "as of week W year Y") |
| 1st serves in %, 1st/2nd serve pts won %, 2nd serves in %, aces/match, DF/match | per-match statistics (raw counts) | Supported |
| Break points saved/converted + %, tiebreaks won/played + % | per-match statistics + period scores | Supported (converted derived from opponent row) |
| Return points won %, service games held %, return games won % | per-match statistics | Supported (last two need extended stats; else unavailable) |
| H2H overall + on surface | versus summaries + season surfaces | Supported (scope + date range stated) |
| Recent matches: date, opponent, tournament/level, surface, W/L, set scores, tiebreaks, status (ret/walkover) | summaries | Supported |
| Opponent ranking at the time | — | **Unavailable** (feeds carry current rank only; displayed as "current rank" or unavailable) |

## Known limits (disclosed in UI + reports)

1. **30-match history ceiling** per player per fetch (provider design). Reports covering longer windows are labeled partial.
2. Statistics absent for matches without point-by-point coverage (tier matrix; e.g. early rounds of WTA 250/125s, ITF). Sample sizes are shown per statistic.
3. Ranking date granularity = ranking week, not exact day.
4. Trial quota: conservative client throttle of 1 request / 1.1 s with retry+backoff on 429/5xx (trial limits are commonly ≈1 rps / daily cap; check your marketplace dashboard).
5. Sportradar collects data independently; official data is provided for ATP tournaments only (per FAQ).
