"use client";

import type { AggregateStat, PerMatchStat } from "@/lib/stats";
import type { PlayerReportBlock, RecentMatchView } from "@/lib/service";

export function fmtPct(p: number | null, digits = 1): string | null {
  return p === null || Number.isNaN(p) ? null : `${p.toFixed(digits)}%`;
}

function AggVal({ s }: { s: AggregateStat }) {
  if (!s.available) {
    return (
      <span className="unavail">
        n/a <span className="sub">{s.matchesSupporting} matches with data</span>
      </span>
    );
  }
  return (
    <span>
      {fmtPct(s.ratio.pct)}
      <span className="sub">
        {s.ratio.num}/{s.ratio.den} · {s.matchesSupporting}m{s.ratio.num === 0 ? " · true zero" : ""}
      </span>
    </span>
  );
}

function PmVal({ s, unit }: { s: PerMatchStat; unit: string }) {
  if (!s.available) return <span className="unavail">n/a</span>;
  return (
    <span>
      {(s.perMatch ?? 0).toFixed(2)} <span className="sub">{unit}/match · {s.matchesSupporting}m{s.total === 0 ? " · true zero" : ""}</span>
    </span>
  );
}

function wlTag(m: RecentMatchView) {
  if (m.playerWon === null) return <span className="wl">–</span>;
  return <span className={`wl ${m.playerWon ? "w" : "l"}`}>{m.playerWon ? "W" : "L"}</span>;
}

function MatchTable({ matches, emptyText }: { matches: RecentMatchView[]; emptyText: string }) {
  if (matches.length === 0) return <div className="notice info">{emptyText}</div>;
  return (
    <table className="mtable">
      <thead>
        <tr>
          <th></th>
          <th>Date</th>
          <th>Opponent</th>
          <th>Event</th>
          <th>Surface</th>
          <th>Score</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {matches.map((m) => (
          <tr key={m.id} className="mrow">
            <td>{wlTag(m)}</td>
            <td style={{ whiteSpace: "nowrap" }}>{m.date}</td>
            <td>
              {m.opponent.name} {m.opponent.countryCode ? `(${m.opponent.countryCode})` : ""}
            </td>
            <td>
              {m.competition ?? "?"}{" "}
              <span style={{ color: "var(--faint)" }}>
                {[m.level ?? m.category, m.isQualification ? "qualifying" : null, m.round].filter(Boolean).join(" · ")}
              </span>
            </td>
            <td style={{ whiteSpace: "nowrap" }}>{m.surface}</td>
            <td className="score">{m.scoreText}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              {m.outcome !== "completed" ? m.outcome : ""}
              {m.outcome !== "completed" && <span className="tag ret">excluded</span>}
              {!m.statsAvailable && <span className="tag">no stats</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PlayerPanel({
  title,
  block,
}: {
  title: string;
  block: PlayerReportBlock;
}) {
  const a = block.agg;
  const rows: Array<[string, React.ReactNode]> = [];
  rows.push([
    "Matches won / played",
    <span>
      {a.matchesWon}/{a.matchesCompleted}
      <span className="sub">
        {a.winPct === null ? "n/a" : fmtPct(a.winPct)} · {a.matchesLost}L
        {a.matchesRetired > 0 ? ` · ${a.matchesRetired} retired` : ""}
        {a.matchesWalkover > 0 ? ` · ${a.matchesWalkover} walkover` : ""}
        {a.matchesDefaulted > 0 ? ` · ${a.matchesDefaulted} defaulted` : ""}
      </span>
    </span>,
  ]);
  rows.push([
    "Titles / tournaments",
    block.yearAggregate ? (
      <span>
        {block.yearAggregate.competitionsWon}/{block.yearAggregate.competitionsPlayed}
        <span className="sub">
          {block.yearAggregate.competitionsPlayed > 0
            ? fmtPct((100 * block.yearAggregate.competitionsWon) / block.yearAggregate.competitionsPlayed)
            : "n/a"}{" "}
          · provider aggregate · {block.yearAggregate.years.join(", ")}
        </span>
      </span>
    ) : (
      <span className="unavail">n/a <span className="sub">whole-calendar-year aggregate only</span></span>
    ),
  ]);
  rows.push([
    "Ranking",
    block.ranking ? (
      <span>
        {block.ranking.tour} #{block.ranking.rank}
        <span className="sub">
          {block.ranking.asOf}
          {block.ranking.movement !== null && block.ranking.movement !== 0
            ? ` · ${block.ranking.movement > 0 ? "+" : ""}${block.ranking.movement}`
            : ""}
        </span>
      </span>
    ) : (
      <span className="unavail">n/a</span>
    ),
  ]);
  rows.push(["First serves in", <AggVal s={a.firstServeInPct} />]);
  rows.push(["1st-serve points won", <AggVal s={a.firstServePointsWonPct} />]);
  rows.push(["Second serves in", <AggVal s={a.secondServeInPct} />]);
  rows.push(["2nd-serve points won", <AggVal s={a.secondServePointsWonPct} />]);
  rows.push(["Aces", <PmVal s={a.acesPerMatch} unit="aces" />]);
  rows.push(["Double faults", <PmVal s={a.doubleFaultsPerMatch} unit="DFs" />]);
  rows.push(["Break points saved", <AggVal s={a.breakPointsSavedPct} />]);
  rows.push([
    "Break points converted",
    <span>
      <AggVal s={a.breakPointsConvertedPct} />
    </span>,
  ]);
  rows.push([
    "Tiebreaks",
    a.tiebreaks.matchesSupporting > 0 && a.tiebreaks.played > 0 ? (
      <span>
        {a.tiebreaks.won}/{a.tiebreaks.played} <span className="sub">({fmtPct(a.tiebreaks.pct)})</span>
      </span>
    ) : (
      <span className="unavail">none in window</span>
    ),
  ]);
  rows.push(["Return points won", <AggVal s={a.returnPointsWonPct} />]);
  rows.push(["Service games held", <AggVal s={a.serviceGamesHeldPct} />]);
  rows.push(["Return games won", <AggVal s={a.returnGamesWonPct} />]);

  return (
    <div className="card">
      <div className="playerhead">
        <div>
          <span className="kicker">{title}</span>
          <h2>{block.name}</h2>
        </div>
        {block.ranking && <span className="rank">#{block.ranking.rank}</span>}
        {block.countryCode && <span className="cc">{block.countryCode}</span>}
        {block.handedness && <span className="cc">{block.handedness}</span>}
      </div>
      <div className="meta-line">
        <span>window <b>{block.window.from} → {block.window.to}</b></span>
        <span>covered <b>{block.window.actualOldest ?? "—"} → {block.window.actualNewest ?? "—"}</b></span>
        <span><b>{block.coverage.kept}</b> of {block.coverage.fetched} matches counted</span>
      </div>
      {block.coverage.reasons.map((r, i) => (
        <div className="notice warn" key={i}>
          {r}
        </div>
      ))}
      {a.matchesWithStats < 5 && (
        <div className="notice warn small-sample">Small sample: only {a.matchesWithStats} match(es) have statistics.</div>
      )}
      <table className="compare">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td className="val">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <details className="recent" open={block.recent.length <= 5 && block.recent.length > 0}>
        <summary>
          Recent matches ({block.recent.length}){block.recentAllSurfaces ? " — all-surfaces list below" : ""}
        </summary>
        <MatchTable matches={block.recent} emptyText={`No ${block.name} matches inside the selected window/filters.`} />
        {block.recentAllSurfaces && (
          <>
            <h3 className="sec" style={{ marginTop: 16 }}>All surfaces (informational only)</h3>
            <MatchTable matches={block.recentAllSurfaces} emptyText="No matches in this window." />
          </>
        )}
      </details>
    </div>
  );
}
