/**
 * Builds the compact plain-text "Copy for AI" report from already-computed,
 * display-ready data. The report is generated from the exact same structures
 * the dashboard renders, so the two always agree.
 */
import type { H2HSummary } from "./stats";
import type { AggregateStat, PerMatchStat } from "./stats";
import type { PlayerReportBlock, ScheduledMatchContext } from "./service";
import type { SurfaceFilter, EnvironmentFilter, MatchFormatFilter } from "./model";

export interface ReportInput {
  meta: {
    providerLabel: string;
    demo: boolean;
    demoBanner: string | null;
    retrievedAt: string;
    scheduledMatch: ScheduledMatchContext | null;
    filters: {
      surface: SurfaceFilter;
      environment: EnvironmentFilter;
      format: MatchFormatFilter;
      datePreset: string;
      from: string;
      to: string;
      cutoffIso: string;
      recentCount: number;
    };
  };
  a: PlayerReportBlock;
  b: PlayerReportBlock;
  h2h: H2HSummary | null;
  h2hMatchCount: number;
  errors: string[];
}

const UNAVAILABLE = "unavailable";

function pct(p: number | null): string {
  return p === null || Number.isNaN(p) ? UNAVAILABLE : `${p.toFixed(1)}%`;
}

function num(n: number, digits = 2): string {
  return n.toFixed(digits);
}

function fmtAgg(s: AggregateStat, labelNum = "won", labelDen = "total"): string {
  if (!s.available) return `${UNAVAILABLE} (${s.matchesSupporting} match(es) with data)`;
  return `${s.ratio.num}/${s.ratio.den} (${pct(s.ratio.pct)}) [${s.matchesSupporting} match(es); ${labelNum}/${labelDen}]`;
}

function fmtAggPlain(s: AggregateStat): string {
  if (!s.available) return `${UNAVAILABLE} (no matches with required raw data in window)`;
  return `${s.ratio.num}/${s.ratio.den} (${pct(s.ratio.pct)}) across ${s.matchesSupporting} match(es) with data`;
}

function fmtPerMatch(s: PerMatchStat): string {
  if (!s.available) return `${UNAVAILABLE} (no matches with this stat in window)`;
  return `${num(s.perMatch ?? 0)} (total ${s.total} over ${s.matchesSupporting} match(es) with data)`;
}

function levelLabel(level: string | null, category: string | null): string {
  if (level) return level.replace(/_/g, " ");
  return category ?? "unknown level";
}

function playerSection(tag: "A" | "B", p: PlayerReportBlock): string[] {
  const L: string[] = [];
  L.push(`PLAYER ${tag}: ${p.name}${p.countryCode ? ` (${p.countryCode})` : ""}`);
  L.push(
    `Ranking: ${p.ranking ? `${p.ranking.tour} #${p.ranking.rank}` : UNAVAILABLE}` +
      (p.ranking ? `, as of ${p.ranking.asOf}${p.ranking.movement !== null && p.ranking.movement !== 0 ? ` (${p.ranking.movement > 0 ? "+" : ""}${p.ranking.movement})` : ""}` : ""),
  );
  const agg = p.agg;
  L.push(
    `Matches won: ${agg.matchesWon}/${agg.matchesCompleted} (${agg.winPct === null ? UNAVAILABLE : pct(agg.winPct)}) — normally completed matches only`,
  );
  const excluded: string[] = [];
  if (agg.matchesRetired > 0) excluded.push(`${agg.matchesRetired} retired (${agg.retiredWon} won by this player)`);
  if (agg.matchesWalkover > 0) excluded.push(`${agg.matchesWalkover} walkover(s)`);
  if (agg.matchesDefaulted > 0) excluded.push(`${agg.matchesDefaulted} defaulted`);
  if (excluded.length) L.push(`  Excluded from aggregates: ${excluded.join(", ")}`);
  if (p.yearAggregate) {
    const ya = p.yearAggregate;
    L.push(
      `Tournaments won: ${ya.competitionsWon}/${ya.competitionsPlayed} (${ya.competitionsPlayed > 0 ? pct((100 * ya.competitionsWon) / ya.competitionsPlayed) : UNAVAILABLE}) — provider aggregate, year(s) ${ya.years.join(", ")}, ${ya.surfaceScope}`,
    );
    L.push(`  Provider season match totals (same scope): ${ya.matchesWon}/${ya.matchesPlayed} matches won`);
  } else {
    L.push(`Tournaments won: ${UNAVAILABLE} — provider reports tournament aggregates per whole calendar year; the selected window does not align with one.`);
  }
  L.push(`First serves in: ${fmtAgg(agg.firstServeInPct, "in", "serves")}`);
  L.push(`First-serve points won: ${fmtAgg(agg.firstServePointsWonPct)}`);
  L.push(`Second serves in: ${fmtAgg(agg.secondServeInPct, "in", "second serves")}`);
  L.push(`Second-serve points won: ${fmtAgg(agg.secondServePointsWonPct)}`);
  L.push(`Aces per match: ${fmtPerMatch(agg.acesPerMatch)}`);
  L.push(`Double faults per match: ${fmtPerMatch(agg.doubleFaultsPerMatch)}`);
  L.push(`Break points saved: ${fmtAgg(agg.breakPointsSavedPct, "saved", "faced")}`);
  L.push(`Break points converted: ${fmtAgg(agg.breakPointsConvertedPct, "converted", "opportunities")}${agg.breakPointsConvertedPct.note ? " — " + agg.breakPointsConvertedPct.note : ""}`);
  L.push(
    `Tiebreaks won: ${agg.tiebreaks.matchesSupporting > 0 && agg.tiebreaks.played > 0 ? `${agg.tiebreaks.won}/${agg.tiebreaks.played} (${pct(agg.tiebreaks.pct)})` : `${UNAVAILABLE} (no tiebreaks in window)`}`,
  );
  const extra: string[] = [
    `return points won ${fmtAggPlain(agg.returnPointsWonPct)}`,
    `service games held ${agg.serviceGamesHeldPct.available ? fmtAggPlain(agg.serviceGamesHeldPct) : `${UNAVAILABLE} (needs provider extended stats; ${agg.serviceGamesHeldPct.matchesSupporting} match(es) qualify)`}`,
    `return games won ${agg.returnGamesWonPct.available ? fmtAggPlain(agg.returnGamesWonPct) : `${UNAVAILABLE} (needs provider extended stats; ${agg.returnGamesWonPct.matchesSupporting} match(es) qualify)`}`,
  ];
  L.push(`Additional available statistics: ${extra.join("; ")}`);
  L.push(
    `Statistic sample sizes / missing data: ${agg.matchesCompleted} completed match(es) in window, ${agg.matchesWithStats} with per-match statistics.` +
      (agg.matchesWithStats < 5 ? " SMALL SAMPLE — interpret percentages cautiously." : ""),
  );
  L.push(`Recent matches, newest first (max shown: ${p.recent.length}):`);
  if (p.recent.length === 0) {
    L.push(`  (none in window/filters)`);
  }
  for (const m of p.recent) {
    const wl = m.playerWon === null ? "?" : m.playerWon ? "W" : "L";
    const status =
      m.outcome === "completed" ? "completed" : m.outcome === "retirement" ? "retired (excluded from aggregates)" : m.outcome === "walkover" ? "walkover (excluded from aggregates)" : "defaulted (excluded from aggregates)";
    L.push(
      `  ${m.date} | ${m.opponent.name}${m.opponent.countryCode ? ` (${m.opponent.countryCode})` : ""} | ${m.competition ?? "unknown tournament"} (${levelLabel(m.level, m.category)}${m.isQualification ? ", qualifying" : ""}${m.round ? `, ${m.round}` : ""}) | ${m.surface} | ${wl} | ${m.scoreText} | ${status} | best-of ${m.bestOf ?? "?"} | match stats: ${m.statsAvailable ? "yes" : "no"}`,
    );
  }
  return L;
}

export function buildReport(input: ReportInput): string {
  const { meta, a, b, h2h, errors } = input;
  const f = meta.filters;
  const L: string[] = [];
  if (meta.demoBanner) {
    L.push(meta.demoBanner);
    L.push("");
  }
  L.push("TENNIS MATCH DATA");
  L.push(`Players: ${a.name} vs ${b.name}`);
  const cats = [...new Set([...a.recent.map((r) => r.category), ...b.recent.map((r) => r.category)].filter((c): c is string => !!c))];
  L.push(`Tour/level: ${cats.length ? cats.join(" / ") : "unknown (no matches in window)"} — singles only`);
  const surfaceText = f.surface === "all" ? "All surfaces (aggregates may mix surfaces)" : f.surface[0].toUpperCase() + f.surface.slice(1);
  L.push(`Surface: ${surfaceText}`);
  L.push(`Indoor/outdoor: ${f.environment === "all" ? "not filtered (mixed/unknown)" : f.environment}`);
  L.push(`Format: best of ${f.format === "all" ? "3 or 5 (not filtered)" : f.format}`);
  if (meta.scheduledMatch) {
    const s = meta.scheduledMatch;
    L.push(
      `Scheduled match: ${s.competition ?? "unknown tournament"}${s.round ? `, ${s.round}` : ""}${s.startTime ? `, starts ${s.startTime} UTC` : ", start time unknown"}${s.surfaceLabel ? `, ${s.surfaceLabel}` : ""}${s.bestOf ? `, best of ${s.bestOf}` : ""} (per provider schedule)`,
    );
  } else {
    L.push(`Scheduled match: not specified`);
  }
  L.push(`Statistics window: ${f.from} to ${f.to}`);
  L.push(`Analysis cutoff: ${f.cutoffIso}`);
  L.push(`Source: ${meta.providerLabel}`);
  L.push(`Retrieved: ${meta.retrievedAt}`);
  const partsA = a.coverage.partial ? `A: partial (${a.coverage.reasons.join("; ")})` : `A: complete for provider scope`;
  const partsB = b.coverage.partial ? `B: partial (${b.coverage.reasons.join("; ")})` : `B: complete for provider scope`;
  L.push(`Coverage: ${partsA} | ${partsB}`);

  L.push("");
  L.push(...playerSection("A", a));
  L.push("");
  L.push(...playerSection("B", b));

  L.push("");
  L.push("HEAD-TO-HAND:");
  if (h2h) {
    L.push(
      `Overall: ${h2h.aWon}-${h2h.bWon} for ${a.name} in ${h2h.total} completed match(es) on provider record${h2h.earliest && h2h.latest ? ` (${h2h.earliest} to ${h2h.latest})` : ""}.`,
    );
    L.push(
      `By surface: hard ${h2h.bySurface.hard.aWon}-${h2h.bySurface.hard.bWon}, clay ${h2h.bySurface.clay.aWon}-${h2h.bySurface.clay.bWon}, grass ${h2h.bySurface.grass.aWon}-${h2h.bySurface.grass.bWon}${h2h.unknownSurfaceCount > 0 ? `; ${h2h.unknownSurfaceCount} match(es) with unknown surface excluded from surface split` : ""}.`,
    );
    if (f.surface !== "all") {
      const g = h2h.bySurface[f.surface as "hard" | "clay" | "grass"];
      L.push(`On selected surface (${f.surface}): ${g.aWon}-${g.bWon} for ${a.name}.`);
    }
  } else {
    L.push(`No previous meetings in provider record (or head-to-head unavailable).`);
  }

  L.push("");
  L.push("LIMITATIONS:");
  const lim: string[] = [];
  lim.push("Aggregates use matches the provider returned (max 30 recent per player) inside the selected window; percentages are computed from summed raw counts, not averages of per-match percentages.");
  lim.push("Break points saved/faced use the provider's per-player serving statistics; conversion is derived from the opponents' break-point rows of the same matches.");
  lim.push("Opponent ranking at match time is not provided; current rankings shown are weekly snapshots from the ranking feed.");
  lim.push("Walkovers, retirements and defaults are excluded from every aggregate and from win percentages; they are listed separately.");
  lim.push("Statistics marked 'unavailable' lacked required raw counters in the matches covered; they are never approximated.");
  if (a.window.actualOldest) lim.push(`Player A data actually spans ${a.window.actualOldest} to ${a.window.actualNewest ?? "?"} within the requested window.`);
  if (b.window.actualOldest) lim.push(`Player B data actually spans ${b.window.actualOldest} to ${b.window.actualNewest ?? "?"} within the requested window.`);
  for (const e of errors) lim.push(`Fetch issue: ${e}`);
  if (meta.demoBanner) lim.push(meta.demoBanner + " — synthetic fixtures for interface testing only.");
  for (const l of lim) L.push(`- ${l}`);
  L.push("Complete data does not guarantee accurate predictions; this report only states what was recorded.");

  L.push("");
  L.push("ANALYSIS REQUEST:");
  L.push(
    "Compare these players for the specified match. Explain the key advantages and weaknesses. If the data supports a rough estimate, provide each player's estimated winning chance, totaling 100%, and explain uncertainty. Do not present judgment-based percentages as calibrated model probabilities or invent missing information.",
  );
  return L.join("\n");
}
