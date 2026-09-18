/**
 * Regression over REAL Sportradar payloads (trial key, fetched 2026-09-18),
 * trimmed of venue/channels noise. Proves the recent-matches pipeline parses
 * what the live provider actually returns — not just doc-derived fixtures.
 * Source: GET /tennis/trial/v3/en/competitors/sr:competitor:225050/summaries.json
 */
import { describe, it, expect } from "vitest";
import { normalizeSummaries } from "@/lib/providers/sportradar/normalize";

const SINNER = "sr:competitor:225050";
const ZVEREV = "sr:competitor:57163";
const DJOKOVIC = "sr:competitor:14882";

/** Wimbledon 2026 final + semifinal, exactly as returned by the provider. */
function realSinnerSummaries() {
  return {
    generated_at: "2026-09-18T16:04:29+00:00",
    summaries: [
      {
        sport_event: {
          id: "sr:sport_event:72318992",
          start_time: "2026-07-12T15:05:00+00:00",
          start_time_confirmed: true,
          sport_event_context: {
            sport: { id: "sr:sport:5", name: "Tennis" },
            category: { id: "sr:category:3", name: "ATP" },
            competition: { id: "sr:competition:2555", name: "Wimbledon Men Singles", parent_id: "sr:competition:2553", type: "singles", gender: "men", level: "grand_slam" },
            season: { id: "sr:season:132572", name: "Wimbledon Men Singles 2026", start_date: "2026-06-22", end_date: "2026-07-12", year: "2026", competition_id: "sr:competition:2555" },
            stage: { order: 2, type: "cup", phase: "stage_1_playoff", start_date: "2026-06-29", end_date: "2026-07-12", year: "2026" },
            round: { name: "final" },
            groups: [{ id: "sr:cup:190050", name: "2026 Wimbledon, London, Great Britain" }],
            mode: { best_of: 5 },
          },
          coverage: { type: "sport_event", sport_event_properties: { enhanced_stats: true, scores: "live", detailed_serve_outcomes: true, play_by_play: true } },
          competitors: [
            { id: SINNER, name: "Sinner, Jannik", country: "Italy", country_code: "ITA", abbreviation: "SIN", qualifier: "home", seed: 1, bracket_number: 1 },
            { id: ZVEREV, name: "Zverev, Alexander", country: "Germany", country_code: "DEU", abbreviation: "ZVE", qualifier: "away", seed: 2, bracket_number: 128 },
          ],
        },
        sport_event_status: {
          status: "closed",
          match_status: "ended",
          home_score: 3,
          away_score: 1,
          period_scores: [
            { home_score: 6, away_score: 7, type: "set", number: 1, home_tiebreak_score: 7, away_tiebreak_score: 9 },
            { home_score: 7, away_score: 6, type: "set", number: 2, home_tiebreak_score: 7, away_tiebreak_score: 2 },
            { home_score: 6, away_score: 3, type: "set", number: 3 },
            { home_score: 6, away_score: 4, type: "set", number: 4 },
          ],
          winner_id: SINNER,
        },
        statistics: {
          totals: {
            competitors: [
              {
                id: SINNER, name: "Sinner, Jannik", abbreviation: "SIN", qualifier: "home",
                statistics: { aces: 15, breakpoints_won: 2, double_faults: 2, first_serve_points_won: 70, first_serve_successful: 87, games_won: 25, points_won: 145, second_serve_points_won: 32, second_serve_successful: 47, service_games_won: 22, service_points_won: 102, tiebreaks_won: 1, total_breakpoints: 5 },
              },
              {
                id: ZVEREV, name: "Zverev, Alexander", abbreviation: "ZVE", qualifier: "away",
                statistics: { aces: 17, breakpoints_won: 0, double_faults: 2, first_serve_points_won: 76, first_serve_successful: 105, games_won: 20, points_won: 130, second_serve_points_won: 20, second_serve_successful: 32, service_games_won: 19, service_points_won: 96, tiebreaks_won: 1, total_breakpoints: 1 },
              },
            ],
          },
        },
      },
      {
        sport_event: {
          id: "sr:sport_event:72318982",
          start_time: "2026-07-10T15:20:00+00:00",
          start_time_confirmed: true,
          sport_event_context: {
            sport: { id: "sr:sport:5", name: "Tennis" },
            category: { id: "sr:category:3", name: "ATP" },
            competition: { id: "sr:competition:2555", name: "Wimbledon Men Singles", parent_id: "sr:competition:2553", type: "singles", gender: "men", level: "grand_slam" },
            season: { id: "sr:season:132572", name: "Wimbledon Men Singles 2026", start_date: "2026-06-22", end_date: "2026-07-12", year: "2026", competition_id: "sr:competition:2555" },
            stage: { order: 2, type: "cup", phase: "stage_1_playoff", start_date: "2026-06-29", end_date: "2026-07-12", year: "2026" },
            round: { name: "semifinal" },
            mode: { best_of: 5 },
          },
          competitors: [
            { id: SINNER, name: "Sinner, Jannik", country: "Italy", country_code: "ITA", abbreviation: "SIN", qualifier: "home", seed: 1 },
            { id: DJOKOVIC, name: "Djokovic, Novak", country: "Serbia", country_code: "SRB", abbreviation: "DJO", qualifier: "away", seed: 7 },
          ],
        },
        sport_event_status: {
          status: "closed",
          match_status: "ended",
          home_score: 3,
          away_score: 0,
          period_scores: [
            { home_score: 6, away_score: 4, type: "set", number: 1 },
            { home_score: 6, away_score: 4, type: "set", number: 2 },
            { home_score: 6, away_score: 4, type: "set", number: 3 },
          ],
          winner_id: SINNER,
        },
        statistics: {
          totals: {
            competitors: [
              {
                id: SINNER, name: "Sinner, Jannik", abbreviation: "SIN", qualifier: "home",
                statistics: { aces: 16, breakpoints_won: 3, double_faults: 0, first_serve_points_won: 44, first_serve_successful: 50, games_won: 18, points_won: 103, second_serve_points_won: 18, second_serve_successful: 29, service_games_won: 15, service_points_won: 62, tiebreaks_won: 0, total_breakpoints: 13 },
              },
              {
                id: DJOKOVIC, name: "Djokovic, Novak", abbreviation: "DJO", qualifier: "away",
                statistics: { aces: 8, breakpoints_won: 0, double_faults: 3, first_serve_points_won: 49, first_serve_successful: 65, games_won: 12, points_won: 81, second_serve_points_won: 15, second_serve_successful: 37, service_games_won: 12, service_points_won: 64, tiebreaks_won: 0, total_breakpoints: 1 },
              },
            ],
          },
        },
      },
    ],
  };
}

describe("real provider payload: Sinner summaries (fetched live 2026-09-18)", () => {
  const { matches, dropped } = normalizeSummaries(realSinnerSummaries(), { id: SINNER, name: "Sinner, Jannik", countryCode: "ITA" });

  it("parses both real matches as singles finals-grade events", () => {
    expect(matches.length).toBe(2);
    expect(dropped.nonSingles).toBe(0);
    expect(dropped.malformed).toBe(0);
  });

  it("gets the Wimbledon final right: winner, sets, tiebreaks, round, best-of", () => {
    const final = matches.find((m) => m.id === "sr:sport_event:72318992")!;
    expect(final).toBeTruthy();
    expect(final.playerWon).toBe(true);
    expect(final.notFinal).toBe(false);
    expect(final.opponent.id).toBe(ZVEREV);
    expect(final.opponent.name).toBe("Alexander Zverev");
    expect(final.competition).toBe("Wimbledon Men Singles");
    expect(final.competitionLevel).toBe("grand_slam");
    expect(final.round).toBe("Final");
    expect(final.bestOf).toBe(5);
    expect(final.seasonId).toBe("sr:season:132572");
    expect(final.date).toBe("2026-07-12");
    // 4 sets, first two decided by tiebreak (scores preserved exactly)
    expect(final.sets.length).toBe(4);
    expect(final.sets[0]).toMatchObject({ setNumber: 1, homeGames: 6, awayGames: 7, homeTiebreak: 7, awayTiebreak: 9 });
    expect(final.sets[1]).toMatchObject({ setNumber: 2, homeGames: 7, awayGames: 6, homeTiebreak: 7, awayTiebreak: 2 });
    expect(final.sets[3]).toMatchObject({ setNumber: 4, homeGames: 6, awayGames: 4, homeTiebreak: null });
  });

  it("reads match statistics from statistics.totals.competitors[]", () => {
    const final = matches.find((m) => m.id === "sr:sport_event:72318992")!;
    expect(final.statsAvailable).toBe(true);
    expect(final.stats).toMatchObject({
      aces: 15,
      firstServeSuccessful: 87,
      firstServePointsWon: 70,
      secondServeSuccessful: 47,
      secondServePointsWon: 32,
      breakpointsWon: 2,
      totalBreakpoints: 5,
      serviceGamesWon: 22,
      gamesWon: 25,
      pointsWon: 145,
      tiebreaksWon: 1,
    });
    expect(final.opponentStats).toMatchObject({ aces: 17, totalBreakpoints: 1, breakpointsWon: 0 });
  });

  it("straight-sets semifinal: 3 sets, no tiebreaks, correct orientation", () => {
    const sf = matches.find((m) => m.id === "sr:sport_event:72318982")!;
    expect(sf.playerWon).toBe(true);
    expect(sf.playerIsHome).toBe(true);
    expect(sf.round).toBe("Semifinal");
    expect(sf.sets.length).toBe(3);
    expect(sf.sets.every((s) => s.homeGames === 6 && s.awayGames === 4 && s.homeTiebreak === null)).toBe(true);
  });

  it("newest-first ordering is preserved (final before semifinal)", () => {
    expect(matches[0].date >= matches[1].date).toBe(true);
    expect(matches[0].id).toBe("sr:sport_event:72318992");
  });
});
