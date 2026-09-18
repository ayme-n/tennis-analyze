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
        unavailable
        <span className="sub">{s.matchesSupporting} match(es) with data</span>
      </span>
    );
  }
  return (
    <span>
      {fmtPct(s.ratio.pct)}{" "}
      <span className="sub">
        {s.ratio.num}/{s.ratio.den} · {s.matchesSupporting}m
        {s.ratio.num === 0 ? " (genuine zero)" : ""}
      </span>
    </span>
  );
}

function PmVal({ s, unit }: { s: PerMatchStat; unit: string }) {
  if (!s.available) return <span className="unavail">unavailable</span>;
  return (
    <span>
      {(s.perMatch ?? 0).toFixed(2)} <span className="sub">{unit} · {s.matchesSupporting}m{s.total === 0 ? " · genuine zero" : ""}</span>
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
          <th>Tournament · level · round</th>
          <th>Surface</th>
          <th>Score</th>
          <th>Status</th>
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
              {m.competition ?? "?"} <span style={{ color: "var(--muted)" }}>{[m.level ?? m.category, m.isQualification ? "qualifying" : null, m.round].filter(Boolean).join(" · ")}</span>
            </td>
            <td style={{ whiteSpace: "nowrap" }}>{m.surface}</td>
            <td className="score">{m.scoreText}</td>
            <td>
              {m.outcome === "completed" ? "completed" : m.outcome}
              {m.outcome !== "completed" && <span className="tag ret">excluded</span>}
              {!m.statsAvailable && <span className="tag">no match stats</span>}
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
  otherName,
}: {
  title: string;
  block: PlayerReportBlock;
  otherName: string;
}) {
  const a = block.agg;
  const rows: Array<[string, React.ReactNode]> = [];
  rows.push([
    "Matches won / played",
    <span>
      {a.matchesWon}/{a.matchesCompleted}{" "}
      <span className="sub">({a.winPct === null ? "n/a" : fmtPct(a.winPct)}) · {a.matchesLost}L{a.matchesRetired > 0 ? ` · ${a.matchesRetired} retired` : ""}{a.matchesWalkover > 0 ? ` · ${a.matchesWalkover} walkover` : ""}{a.matchesDefaulted > 0 ? ` · ${a.matchesDefaulted} defaulted` : ""}</span>
    </span>,
  ]);
  rows.push([
    "Tournaments won / entered",
    block.yearAggregate ? (
      <span>
        {block.yearAggregate.competitionsWon}/{block.yearAggregate.competitionsPlayed}
        <span className="sub">
          {block.yearAggregate.competitionsPlayed > 0 ? fmtPct((100 * block.yearAggregate.competitionsWon) / block.yearAggregate.competitionsPlayed) : "n/a"} · provider aggregate · {block.yearAggregate.years.join(", ")}
        </span>
      </span>
    ) : (
      <span className="unavail">unavailable <span className="sub">whole-calendar-year provider aggregate only</span></span>
    ),
  ]);
  rows.push([
    "Ranking",
    block.ranking ? (
      <span>
        {block.ranking.tour} #{block.ranking.rank}
        <span className="sub">
          as of {block.ranking.asOf}
          {block.ranking.movement !== null && block.ranking.movement !== 0 ? ` · ${block.ranking.movement > 0 ? "+" : ""}${block.ranking.movement}` : ""}
        </span>
      </span>
    ) : (
      <span className="unavail">unavailable</span>
    ),
  ]);
  rows.push(["First serves in", <AggVal s={a.firstServeInPct} />]);
  rows.push(["First-serve points won", <AggVal s={a.firstServePointsWonPct} />]);
  rows.push(["Second serves in", <AggVal s={a.secondServeInPct} />]);
  rows.push(["Second-serve points won", <AggVal s={a.secondServePointsWonPct} />]);
  rows.push(["Aces per match", <PmVal s={a.acesPerMatch} unit="aces" />]);
  rows.push(["Double faults per match", <PmVal s={a.doubleFaultsPerMatch} unit="DFs" />]);
  rows.push(["Break points saved", <AggVal s={a.breakPointsSavedPct} />]);
  rows.push([
    "Break points converted",
    <>
      <AggVal s={a.breakPointsConvertedPct} />
      <span className="sub">from opponents' rows</span>
    </>,
  ]);
  rows.push([
    "Tiebreaks won / played",
    a.tiebreaks.matchesSupporting > 0 && a.tiebreaks.played > 0 ? (
      <span>
        {a.tiebreaks.won}/{a.tiebreaks.played} <span className="sub">({fmtPct(a.tiebreaks.pct)})</span>
      </span>
    ) : (
      <span className="unavail">no tiebreaks in window</span>
    ),
  ]);
  rows.push(["Return points won", <AggVal s={a.returnPointsWonPct} />]);
  rows.push(["Service games held", <AggVal s={a.serviceGamesHeldPct} />]);
  rows.push(["Return games won", <AggVal s={a.returnGamesWonPct} />]);

  return (
    <div className="card">
      <div className="playerhead">
        <h2>
          {title}: {block.name}
        </h2>
        {block.countryCode && <span className="cc">{block.countryCode}</span>}
        {block.ranking && <span className="rank">#{block.ranking.rank}</span>}
        {block.handedness && <span className="cc">{block.handedness}-handed</span>}
      </div>
      <div className="meta-line">
        <span>
          window <b>{block.window.from}</b> → <b>{block.window.to}</b>
        </span>
        <span>
          data actually spans <b>{block.window.actualOldest ?? "—"}</b> → <b>{block.window.actualNewest ?? "—"}</b>
        </span>
        <span>
          <b>{block.coverage.kept}</b> match(es) counted of {block.coverage.fetched} singles fetched
        </span>
      </div>
      {block.coverage.reasons.map((r, i) => (
        <div className="notice warn" key={i}>
          ⚠ {r}
        </div>
      ))}
      {a.matchesWithStats < 5 && (
        <div className="notice warn small-sample">⚠ Small sample: only {a.matchesWithStats} match(es) carry statistics — percentages may swing wildly.</div>
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
          Recent matches (newest {block.recent.length}) — filtered view{block.recentAllSurfaces ? " · all-surfaces form below" : ""}
        </summary>
        <MatchTable matches={block.recent} emptyText={`No matches of ${block.name} inside the selected window/filters.`} />
        {block.recentAllSurfaces && (
          <>
            <h3 className="sec">All-surfaces recent form — informational only, does NOT change the aggregates above</h3>
            <MatchTable matches={block.recentAllSurfaces} emptyText="No matches at all in this window." />
          </>
        )}
      </details>
      <div className="meta-line" style={{ marginTop: 10 }}>
        <span>upcoming opponent: {otherName}</span>
      </div>
    </div>
  );
}
