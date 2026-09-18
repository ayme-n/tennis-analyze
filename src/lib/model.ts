/**
 * Normalized data model. Provider adapters translate their raw payloads into
 * these types; statistics and reports are computed only from these types.
 */

export type SurfaceGroup = "hard" | "clay" | "grass";
export type SurfaceFilter = SurfaceGroup | "all";
export type Environment = "indoor" | "outdoor" | "unknown";
export type EnvironmentFilter = "all" | "indoor" | "outdoor";
export type MatchFormatFilter = 3 | 5 | "all";

/** Normalized surface classification. `group:null` => not Hard/Clay/Grass. */
export interface SurfaceInfo {
  /** Raw provider surface string, e.g. "hardcourt_outdoor". null when the provider has no value. */
  raw: string | null;
  group: SurfaceGroup | null;
  environment: Environment;
}

export interface PlayerRef {
  id: string;
  name: string; // "First Last"
  countryCode: string | null;
}

export interface DirectoryPlayer extends PlayerRef {
  tour: "ATP" | "WTA" | null;
  gender: "male" | "female" | null;
  rank: number | null;
  points: number | null;
  movement: number | null;
  country: string | null;
  source: "rankings" | "schedule" | "extra";
}

export type MatchOutcome = "completed" | "retirement" | "walkover" | "defaulted";

export interface SetScore {
  setNumber: number;
  /** Games won by each side, home/away as provided, never re-ordered. */
  homeGames: number;
  awayGames: number;
  /** Tiebreak points when the set ended in a tiebreak (7-6). */
  homeTiebreak: number | null;
  awayTiebreak: number | null;
  /** "set" | "tiebreak" — "tiebreak" = deciding match tiebreak (e.g. 10-point). */
  periodType: "set" | "tiebreak";
}

/** Raw per-competitor match statistics as documented, all optional. */
export interface MatchSideStats {
  aces: number | null;
  doubleFaults: number | null;
  firstServeSuccessful: number | null;
  firstServePointsWon: number | null;
  secondServeSuccessful: number | null;
  secondServePointsWon: number | null;
  breakpointsWon: number | null; // server perspective: saved
  totalBreakpoints: number | null; // server perspective: faced
  pointsWon: number | null;
  gamesWon: number | null;
  serviceGamesWon: number | null; // extended stats
  tiebreaksWon: number | null; // extended stats (not used by default; we derive from scores)
}

export interface NormalizedMatch {
  id: string;
  /** UTC ISO start time (may be scheduled match date only). */
  startTime: string | null;
  date: string; // yyyy-mm-dd, UTC date of startTime (or declared date)
  player: PlayerRef;
  opponent: PlayerRef;
  /** Whether `player` was listed first (home) by the provider. */
  playerIsHome: boolean;
  outcome: MatchOutcome;
  /** True when the provider still marks the match live/not final. */
  notFinal: boolean;
  playerWon: boolean | null;
  sets: SetScore[]; // provider order (home/away)
  competition: string | null; // tournament/competition name
  competitionLevel: string | null; // e.g. grand_slam, atp_500 ... null for ITF/Challenger
  category: string | null; // tour/category name: ATP, WTA, Challenger, ITF Men...
  round: string | null;
  isQualification: boolean;
  bestOf: number | null;
  seasonId: string | null;
  surface: SurfaceInfo; // unknown until season info attached
  stats: MatchSideStats | null; // selected player's match stats
  opponentStats: MatchSideStats | null;
  statsAvailable: boolean;
}

export interface RankingInfo {
  rank: number;
  tour: string;
  points: number | null;
  movement: number | null;
  /** e.g. "2026-W38" — rankings are weekly. */
  asOf: string;
}

export interface YearSurfaceTotals {
  year: number;
  surface: SurfaceInfo;
  matchesPlayed: number;
  matchesWon: number;
  competitionsPlayed: number;
  competitionsWon: number;
}

export interface PlayerProfile {
  id: string;
  name: string;
  countryCode: string | null;
  gender: "male" | "female" | null;
  handedness: string | null;
  ranking: RankingInfo | null;
  yearSurfaceTotals: YearSurfaceTotals[];
}

export interface UpcomingMatch {
  id: string;
  startTime: string | null;
  playerA: PlayerRef;
  playerB: PlayerRef;
  competition: string | null;
  category: string | null;
  level: string | null;
  round: string | null;
  bestOf: number | null;
  seasonId: string | null;
  surface: SurfaceInfo;
}

export interface HeadToHead {
  matches: NormalizedMatch[]; // normalized relative to player A
  note: string | null;
}

/** Provenance for one provider call. */
export interface SourceTrace {
  description: string;
  fetchedAt: string; // ISO
  fromCache: boolean;
  cacheKey: string;
}

export type ProviderErrorCode =
  | "not_configured"
  | "auth_failed"
  | "rate_limited"
  | "http_error"
  | "bad_response"
  | "network";

export class ProviderError extends Error {
  code: ProviderErrorCode;
  status?: number;
  constructor(code: ProviderErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Result of inspecting (and optionally live-probing) the configured provider. */
export interface ProviderDiagnosis {
  connected: boolean;
  /** Never the raw key — a short mask plus length, so deployments can be verified safely. */
  keyMasked: string;
  accessLevel: string;
  /** The exact provider endpoint URL a request would hit (contains no secret). */
  endpoint: string;
  /** Present only when a live probe was requested. */
  probe?: {
    ok: boolean;
    httpStatus: number | null;
    message: string;
    /** Players parsed from the rankings feed when the probe succeeded (null if not JSON). */
    directoryPlayers?: number | null;
    /** Top-level payload keys when 0 players parsed — a shape-mismatch hint. */
    payloadKeys?: string[];
  };
}

/** The provider contract. Implementations: Sportradar (real), Demo (synthetic). */
export interface TennisDataProvider {
  readonly id: string;
  readonly label: string;
  readonly connected: boolean;
  status(): Promise<{ connected: boolean; detail: string }>;
  /** Inspect the live configuration; with `probe` also perform one real request. */
  diagnose?(probe?: boolean): Promise<ProviderDiagnosis>;
  /** Size + sample of the searchable player directory (debug aid). */
  directoryStats?(): Promise<{ size: number; sample: string[] }>;
  searchPlayers(query: string): Promise<DirectoryPlayer[]>;
  getPlayerProfile(id: string): Promise<PlayerProfile>;
  getRecentMatches(id: string): Promise<{ matches: NormalizedMatch[]; traces: SourceTrace[] }>;
  getUpcomingMatches(days: number): Promise<{ matches: UpcomingMatch[]; traces: SourceTrace[] }>;
  getHeadToHead(aId: string, bId: string): Promise<{ h2h: HeadToHead; traces: SourceTrace[] }>;
  /** attach surface info for season ids (normalized matches reference seasonId) */
  resolveSurfaces(seasonIds: string[]): Promise<{ byId: Map<string, SurfaceInfo>; traces: SourceTrace[] }>;
  /** discard cached entries (data reload); keep directory caches when dirOnly */
  refresh(opts: { directoryOnly?: boolean }): void;
}
