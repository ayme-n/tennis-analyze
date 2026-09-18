/**
 * Fixtures mirroring the VERIFIED Sportradar tennis v3 documented shapes
 * (developer.sportradar.com/tennis/reference/*, checked 2026-09-18).
 * Match statistics lines are taken from the official docs' own sample
 * (Sinner vs Zverev) so derived formulas are checked against realistic,
 * internally consistent numbers.
 */

export const PLAYER_A = { id: "sr:competitor:225050", name: "Sinner, Jannik", cc: "ITA" };
export const PLAYER_B = { id: "sr:competitor:57163", name: "Zverev, Alexander", cc: "GER" };
export const PLAYER_C = { id: "sr:competitor:999", name: "Testovic, Test", cc: "AUT" };

export function rankingsPayload() {
  return {
    generated_at: "2026-09-14T08:00:00.000Z",
    rankings: [
      {
        name: "ATP",
        gender: "men",
        type_id: 1,
        week: 38,
        year: 2026,
        competitor_rankings: [
          { rank: 1, movement: 0, points: 12030, competitions_played: 14, competitor: { id: PLAYER_A.id, name: PLAYER_A.name, country: "Italy", country_code: PLAYER_A.cc, abbreviation: "SIN" } },
          { rank: 2, movement: 1, points: 6030, competitions_played: 16, competitor: { id: PLAYER_B.id, name: PLAYER_B.name, country: "Germany", country_code: PLAYER_B.cc, abbreviation: "ZVE" } },
          { rank: 350, movement: -4, points: 180, competitions_played: 20, competitor: { id: PLAYER_C.id, name: PLAYER_C.name, country: "Austria", country_code: PLAYER_C.cc, abbreviation: "TES" } },
        ],
      },
      {
        name: "WTA",
        gender: "women",
        type_id: 1,
        week: 38,
        year: 2026,
        competitor_rankings: [
          { rank: 1, movement: 0, points: 11000, competitions_played: 13, competitor: { id: "sr:competitor:sw1", name: "Swiatek, Iga", country: "Poland", country_code: "POL", abbreviation: "SWI" } },
        ],
      },
    ],
  };
}

export function profilePayloadA() {
  return {
    competitor: { id: PLAYER_A.id, name: PLAYER_A.name, country: "Italy", country_code: PLAYER_A.cc, gender: "male", abbreviation: "SIN" },
    info: { date_of_birth: "2001-08-16", handedness: "right", height: 188, weight: 76, highest_singles_ranking: 1, highest_singles_ranking_date: "06.2024" },
    competitor_rankings: [{ competitor_id: PLAYER_A.id, name: "ATP", rank: 1, movement: 0, points: 12030, type: "singles", race_ranking: false }],
    periods: [
      {
        year: 2026,
        surfaces: [
          { type: "hardcourt_outdoor", statistics: { competitions_played: 4, competitions_won: 2, matches_played: 20, matches_won: 18 } },
          { type: "red_clay", statistics: { competitions_played: 4, competitions_won: 3, matches_played: 19, matches_won: 18 } },
        ],
      },
      {
        year: 2025,
        surfaces: [{ type: "grass", statistics: { competitions_played: 1, competitions_won: 1, matches_played: 7, matches_won: 7 } }],
      },
    ],
  };
}

/** The documented Sinner stats line from the official "Closed match statistics" sample. */
export function sinnerDocStats() {
  return {
    aces: 15, backhand_errors: 31, backhand_unforced_errors: 6, backhand_winners: 8,
    breakpoints_won: 2, double_faults: 2, drop_shot_unforced_errors: 0, drop_shot_winners: 0,
    first_serve_points_won: 70, first_serve_successful: 87, forehand_errors: 25,
    forehand_unforced_errors: 17, forehand_winners: 35, games_won: 25, groundstroke_errors: 54,
    groundstroke_unforced_errors: 22, groundstroke_winners: 37, lob_unforced_errors: 0, lob_winners: 0,
    max_games_in_a_row: 3, max_points_in_a_row: 8, overhead_stroke_errors: 0,
    overhead_stroke_unforced_errors: 0, overhead_stroke_winners: 0, points_won: 145,
    points_won_from_last_10: 6, return_errors: 0, return_winners: 0, second_serve_points_won: 32,
    second_serve_successful: 47, service_games_won: 22, service_points_lost: 34,
    service_points_won: 102, tiebreaks_won: 1, total_breakpoints: 5, volley_unforced_errors: 1, volley_winners: 6,
  };
}

/** Zverev side adjusted to be consistent with the Sinner sample (seen globally in tests). */
export function zverevDocStats() {
  return {
    aces: 17, breakpoints_won: 0, double_faults: 2, first_serve_points_won: 76,
    first_serve_successful: 105, games_won: 20, points_won: 131, second_serve_points_won: 21,
    second_serve_successful: 29, service_games_won: 17, total_breakpoints: 3,
  };
}

export interface SummaryItemOpts {
  id: string;
  startTime: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  type?: string;
  level?: string;
  category?: string;
  seasonId?: string;
  status?: string;
  matchStatus?: string;
  winningReason?: string | null;
  winnerId?: string | null;
  sets?: Array<{ n: number; h: number; a: number; ht?: number | null; at?: number | null; type?: string }>;
  statsHome?: Record<string, number> | null;
  statsAway?: Record<string, number> | null;
  statsWrapper?: "totals" | "plain";
  bestOf?: number;
  round?: string;
}

export function summaryItem(o: SummaryItemOpts) {
  const item: Record<string, unknown> = {
    sport_event: {
      id: o.id,
      start_time: o.startTime,
      sport_event_context: {
        sport: { id: "sr:sport:5", name: "Tennis" },
        category: { id: "sr:category:3", name: o.category ?? "ATP" },
        competition: { id: "sr:competition:1", name: "Cincinnati Men Singles", type: o.type ?? "singles", gender: "men", level: o.level ?? "atp_1000" },
        season: { id: o.seasonId ?? "sr:season:h1", name: "Cincinnati Men Singles 2026", start_date: "2026-08-10", end_date: "2026-08-16", year: "2026", competition_id: "sr:competition:1" },
        stage: { type: "cup", phase: o.round?.startsWith("qualification") ? "qualification" : "main_draw" },
        round: { name: o.round ?? "final" },
        mode: { best_of: o.bestOf ?? 3 },
      },
      competitors: [
        { id: o.homeId, name: o.homeName, country_code: "ITA", abbreviation: "HOM", qualifier: "home" },
        { id: o.awayId, name: o.awayName, country_code: "GER", abbreviation: "AWY", qualifier: "away" },
      ],
    },
    sport_event_status: {
      status: o.status ?? "closed",
      match_status: o.matchStatus ?? "ended",
      winner_id: o.winnerId === null ? undefined : (o.winnerId ?? o.homeId),
      winning_reason: o.winningReason ?? undefined,
      home_score: 2,
      away_score: 1,
      period_scores: (o.sets ?? [{ n: 1, h: 6, a: 4 }, { n: 2, h: 3, a: 6 }, { n: 3, h: 7, a: 6, ht: 7, at: 5 }]).map((s) => ({
        number: s.n,
        home_score: s.h,
        away_score: s.a,
        home_tiebreak_score: s.ht ?? undefined,
        away_tiebreak_score: s.at ?? undefined,
        type: s.type ?? "set",
      })),
    },
  };
  if (o.statsHome || o.statsAway) {
    const list = [
      o.statsHome ? { id: o.homeId, statistics: o.statsHome } : null,
      o.statsAway ? { id: o.awayId, statistics: o.statsAway } : null,
    ].filter(Boolean);
    item.statistics = o.statsWrapper === "plain" ? { competitors: list } : { totals: { competitors: list } };
  }
  return item;
}

/** A's player card: 2 completed matches w/ stats + walkover + retirement + a doubles match that must be dropped. */
export function summariesPayloadForA() {
  return {
    summaries: [
      // M1: hard, won 2-1 (documented stats), home = A
      summaryItem({
        id: "sr:sport_event:m1",
        startTime: "2026-08-14T18:00:00+00:00",
        homeId: PLAYER_A.id, awayId: PLAYER_B.id, homeName: PLAYER_A.name, awayName: PLAYER_B.name,
        seasonId: "sr:season:h1", winnerId: PLAYER_A.id,
        statsHome: sinnerDocStats(), statsAway: zverevDocStats(),
      }),
      // M2: clay, lost 0-2, A away; stats present
      summaryItem({
        id: "sr:sport_event:m2",
        startTime: "2026-06-08T15:00:00+00:00",
        homeId: PLAYER_B.id, awayId: PLAYER_A.id, homeName: PLAYER_B.name, awayName: PLAYER_A.name,
        level: "grand_slam", seasonId: "sr:season:c1", winnerId: PLAYER_B.id,
        sets: [{ n: 1, h: 6, a: 4 }, { n: 2, h: 6, a: 3 }],
        statsHome: { aces: 9, breakpoints_won: 5, total_breakpoints: 8, double_faults: 3, first_serve_points_won: 40, first_serve_successful: 55, second_serve_points_won: 15, second_serve_successful: 27, points_won: 78, games_won: 12, service_games_won: 9 },
        statsAway: { aces: 1, breakpoints_won: 1, total_breakpoints: 4, double_faults: 1, first_serve_points_won: 18, first_serve_successful: 30, second_serve_points_won: 10, second_serve_successful: 20, points_won: 60, games_won: 8, service_games_won: 6 },
      }),
      // M3: walkover, A wins without playing — must be excluded from aggregates
      summaryItem({
        id: "sr:sport_event:m3",
        startTime: "2026-07-20T12:00:00+00:00",
        homeId: PLAYER_A.id, awayId: PLAYER_C.id, homeName: PLAYER_A.name, awayName: PLAYER_C.name,
        seasonId: "sr:season:h1", winnerId: PLAYER_A.id, winningReason: "walkover", matchStatus: "walkover",
        sets: [],
      }),
      // M4: retirement mid-match (A loses by retiring) — excluded from aggregates
      summaryItem({
        id: "sr:sport_event:m4",
        startTime: "2026-07-29T16:00:00+00:00",
        homeId: PLAYER_C.id, awayId: PLAYER_A.id, homeName: PLAYER_C.name, awayName: PLAYER_A.name,
        seasonId: "sr:season:h1", winnerId: PLAYER_C.id, winningReason: "retirement", matchStatus: "retired",
        sets: [{ n: 1, h: 4, a: 2 }],
        statsHome: null, statsAway: null,
      }),
      // M5: doubles — must be dropped (never mix singles & doubles)
      summaryItem({
        id: "sr:sport_event:m5",
        startTime: "2026-08-10T16:00:00+00:00",
        homeId: PLAYER_A.id, awayId: PLAYER_C.id, homeName: "Sinner, Jannik / Partner, Pete", awayName: "Other, One / Pair, Pat",
        type: "doubles", seasonId: "sr:season:h1", winnerId: PLAYER_A.id,
      }),
      // M6: grass season, stats wrapper "plain" + no tiebreak scores recorded on 7-6 set, A wins; BP zero denominator edge
      summaryItem({
        id: "sr:sport_event:m6",
        startTime: "2026-06-30T13:00:00+00:00",
        homeId: PLAYER_A.id, awayId: PLAYER_B.id, homeName: PLAYER_A.name, awayName: PLAYER_B.name,
        level: "grand_slam", seasonId: "sr:season:g1", winnerId: PLAYER_A.id,
        sets: [{ n: 1, h: 7, a: 6 }, { n: 2, h: 6, a: 4 }],
        statsWrapper: "plain",
        statsHome: { aces: 0, breakpoints_won: 0, total_breakpoints: 0, double_faults: 0, first_serve_points_won: 25, first_serve_successful: 33, second_serve_points_won: 11, second_serve_successful: 15, points_won: 70, games_won: 13 },
        statsAway: { aces: 12, breakpoints_won: 0, total_breakpoints: 1, double_faults: 4, first_serve_points_won: 28, first_serve_successful: 44, second_serve_points_won: 8, second_serve_successful: 18, points_won: 66, games_won: 10 },
      }),
      // M7: upcoming shared match (not started) — excluded from results
      summaryItem({
        id: "sr:sport_event:m7",
        startTime: "2026-09-25T18:00:00+00:00",
        homeId: PLAYER_A.id, awayId: PLAYER_B.id, homeName: PLAYER_A.name, awayName: PLAYER_B.name,
        seasonId: "sr:season:h2", status: "not_started", matchStatus: "not_started", winnerId: null, sets: [],
      }),
    ],
  };
}

export function seasonInfoPayload(surface: string) {
  return {
    season: {
      id: "sr:season:x",
      name: "Some Season 2026",
      start_date: "2026-08-10",
      end_date: "2026-08-16",
      year: "2026",
      competition_id: "sr:competition:1",
      competition: { id: "sr:competition:1", name: "Cincinnati Men Singles", type: "singles", gender: "men", level: "atp_1000" },
      info: { surface, prize_currency: "$", prize_money: 1000000 },
    },
  };
}

/** B's own match list: one hard win w/ stats + one clay loss without stats (exercises missing-stat paths). */
export function summariesPayloadForB() {
  return {
    summaries: [
      summaryItem({
        id: "sr:sport_event:b1",
        startTime: "2026-08-24T19:00:00+00:00",
        homeId: PLAYER_B.id, awayId: PLAYER_C.id, homeName: PLAYER_B.name, awayName: PLAYER_C.name,
        level: "atp_500", seasonId: "sr:season:h1", winnerId: PLAYER_B.id,
        sets: [{ n: 1, h: 6, a: 7, ht: 6, at: 8 }, { n: 2, h: 6, a: 2 }, { n: 3, h: 6, a: 4 }],
        statsHome: { aces: 11, breakpoints_won: 4, total_breakpoints: 6, double_faults: 3, first_serve_points_won: 33, first_serve_successful: 44, second_serve_points_won: 12, second_serve_successful: 24, points_won: 95, games_won: 18, service_games_won: 12 },
        statsAway: { aces: 2, breakpoints_won: 2, total_breakpoints: 5, double_faults: 5, first_serve_points_won: 25, first_serve_successful: 40, second_serve_points_won: 9, second_serve_successful: 18, points_won: 80, games_won: 13 },
      }),
      summaryItem({
        id: "sr:sport_event:b2",
        startTime: "2026-05-30T11:00:00+00:00",
        homeId: PLAYER_C.id, awayId: PLAYER_B.id, homeName: PLAYER_C.name, awayName: PLAYER_B.name,
        level: "grand_slam", seasonId: "sr:season:c1", winnerId: PLAYER_C.id,
        sets: [{ n: 1, h: 6, a: 3 }, { n: 2, h: 4, a: 6 }, { n: 3, h: 6, a: 2 }, { n: 4, h: 6, a: 3 }],
        bestOf: 5,
        statsHome: null, statsAway: null,
      }),
    ],
  };
}

export function profilePayloadB() {
  return {
    competitor: { id: PLAYER_B.id, name: PLAYER_B.name, country: "Germany", country_code: PLAYER_B.cc, gender: "male", abbreviation: "ZVE" },
    info: { date_of_birth: "1997-04-20", handedness: "right", height: 198, weight: 90 },
    competitor_rankings: [{ competitor_id: PLAYER_B.id, name: "ATP", rank: 2, movement: 1, points: 6030, type: "singles", race_ranking: false }],
    periods: [
      {
        year: 2026,
        surfaces: [{ type: "hardcourt_outdoor", statistics: { competitions_played: 5, competitions_won: 1, matches_played: 18, matches_won: 12 } }],
      },
    ],
  };
}

export function versusPayload() {
  return {
    summaries: [],
    last_meetings: {
      summaries: [
        summaryItem({
          id: "sr:sport_event:m1",
          startTime: "2026-08-14T18:00:00+00:00",
          homeId: PLAYER_A.id, awayId: PLAYER_B.id, homeName: PLAYER_A.name, awayName: PLAYER_B.name,
          seasonId: "sr:season:h1", winnerId: PLAYER_A.id,
          statsHome: sinnerDocStats(), statsAway: zverevDocStats(),
        }),
        summaryItem({
          id: "sr:sport_event:h2h_old",
          startTime: "2025-11-10T18:00:00+00:00",
          homeId: PLAYER_B.id, awayId: PLAYER_A.id, homeName: PLAYER_B.name, awayName: PLAYER_A.name,
          seasonId: "sr:season:h_indoor", winnerId: PLAYER_B.id,
          sets: [{ n: 1, h: 6, a: 3 }, { n: 2, h: 7, a: 6, ht: 9, at: 7 }],
        }),
      ],
    },
    next_meetings: {
      summaries: [
        summaryItem({
          id: "sr:sport_event:m7",
          startTime: "2026-09-25T18:00:00+00:00",
          homeId: PLAYER_A.id, awayId: PLAYER_B.id, homeName: PLAYER_A.name, awayName: PLAYER_B.name,
          seasonId: "sr:season:h2", status: "not_started", matchStatus: "not_started", winnerId: null, sets: [],
        }),
      ],
    },
  };
}

export function dailySummariesPayload() {
  return {
    summaries: [
      summaryItem({
        id: "sr:sport_event:u1",
        startTime: "2026-09-19T18:00:00+00:00",
        homeId: PLAYER_A.id, awayId: PLAYER_B.id, homeName: PLAYER_A.name, awayName: PLAYER_B.name,
        seasonId: "sr:season:h2", status: "not_started", matchStatus: "not_started", winnerId: null, sets: [],
        round: "semifinal",
      }),
      summaryItem({
        id: "sr:sport_event:u2",
        startTime: "2026-09-19T12:00:00+00:00",
        homeId: PLAYER_C.id, awayId: PLAYER_B.id, homeName: PLAYER_C.name, awayName: PLAYER_B.name,
        seasonId: "sr:season:c2", status: "live", matchStatus: "1st_set", winnerId: null, sets: [],
      }),
      summaryItem({
        id: "sr:sport_event:u3",
        startTime: "2026-09-19T14:00:00+00:00",
        homeId: PLAYER_A.id, awayId: PLAYER_C.id, homeName: PLAYER_A.name, awayName: PLAYER_C.name,
        type: "doubles", seasonId: "sr:season:c2", status: "not_started", matchStatus: "not_started", winnerId: null, sets: [],
      }),
    ],
  };
}
