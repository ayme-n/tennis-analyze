"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DirectoryPlayer, UpcomingMatch } from "@/lib/model";
import type { PrepResponse, PrepRequest } from "@/lib/service";
import PlayerSelect from "@/components/PlayerSelect";
import PlayerPanel from "@/components/PlayerPanel";
import UpcomingPicker from "@/components/UpcomingPicker";

type DemoFlag = boolean;

interface ProviderStatus {
  connected: boolean;
  detail: string;
  label: string;
}

interface DiagnosisInfo {
  connected: boolean;
  keyMasked: string;
  accessLevel: string;
  endpoint: string;
  probe?: { ok: boolean; httpStatus: number | null; message: string };
}

function SegRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="fgroup">
      <label className="f">{label}</label>
      <div className="seg">
        {options.map((o) => (
          <button key={o.id} type="button" className={value === o.id ? "on" : ""} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisInfo | null>(null);
  const [probing, setProbing] = useState(false);
  const [demo, setDemo] = useState<DemoFlag>(false);
  const [playerA, setPlayerA] = useState<DirectoryPlayer | null>(null);
  const [playerB, setPlayerB] = useState<DirectoryPlayer | null>(null);
  const [surface, setSurface] = useState<string>("hard");
  const [environment, setEnvironment] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<string>("12m");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [format, setFormat] = useState<string>("3");
  const [recentCount, setRecentCount] = useState<string>("4");
  const [recentAllSurfaces, setRecentAllSurfaces] = useState<boolean>(false);
  const [scheduled, setScheduled] = useState<UpcomingMatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string; retryable?: boolean } | null>(null);
  const [data, setData] = useState<PrepResponse | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const reportRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void fetch("/api/status")
      .then((r) => r.json())
      .then((d) => {
        setStatus({ connected: !!d.provider?.connected, detail: d.provider?.detail ?? "", label: d.provider?.label ?? "" });
        if (d.diagnosis) setDiagnosis(d.diagnosis as DiagnosisInfo);
      })
      .catch(() => setStatus({ connected: false, detail: "status check failed", label: "" }));
  }, []);

  const testKey = useCallback(async () => {
    setProbing(true);
    try {
      const r = await fetch("/api/status?probe=1");
      const d = await r.json();
      setDiagnosis((d.diagnosis as DiagnosisInfo) ?? null);
    } catch {
      setDiagnosis({
        connected: false,
        keyMasked: "?",
        accessLevel: "?",
        endpoint: "?",
        probe: { ok: false, httpStatus: null, message: "Could not reach /api/status on this server." },
      });
    } finally {
      setProbing(false);
    }
  }, []);

  const fetchPrep = useCallback(
    async (refresh: boolean) => {
      setError(null);
      if (!playerA || !playerB) {
        setError({ message: "Select Player A and Player B first (search and pick from the list)." });
        return;
      }
      if (playerA.id === playerB.id) {
        setError({ message: "Player A and Player B are the same player." });
        return;
      }
      setLoading(true);
      setCopyState("idle");
      const body: PrepRequest = {
        provider: demo ? "demo" : "auto",
        playerAId: playerA.id,
        playerBId: playerB.id,
        surface: surface as PrepRequest["surface"],
        environment: environment as PrepRequest["environment"],
        format: format === "all" ? "all" : (Number(format) as 3 | 5),
        datePreset: datePreset as PrepRequest["datePreset"],
        from: datePreset === "custom" ? fromDate || null : null,
        to: datePreset === "custom" ? toDate || null : null,
        recentCount: Number(recentCount),
        recentAllSurfaces,
        refresh,
        scheduledMatch: scheduled
          ? {
              id: scheduled.id,
              startTime: scheduled.startTime,
              competition: scheduled.competition,
              category: scheduled.category,
              level: scheduled.level,
              round: scheduled.round,
              bestOf: scheduled.bestOf,
              surfaceLabel: scheduled.surface.raw ? scheduled.surface.raw.replace(/_/g, " ") : null,
            }
          : null,
      };
      try {
        const res = await fetch("/api/prep", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setData(null);
          setError(json.error ?? { message: `Request failed (HTTP ${res.status})` });
        } else {
          setData(json as PrepResponse);
        }
      } catch (e) {
        setData(null);
        setError({ message: `Network error: ${e instanceof Error ? e.message : String(e)}`, retryable: true });
      } finally {
        setLoading(false);
      }
    },
    [playerA, playerB, demo, surface, environment, format, datePreset, fromDate, toDate, recentCount, recentAllSurfaces, scheduled],
  );

  function onUpcomingPick(m: UpcomingMatch) {
    const tourOf = (cat: string | null): "ATP" | "WTA" | null =>
      cat?.includes("WTA") ? "WTA" : cat?.includes("ATP") ? "ATP" : null;
    const mk = (ref: UpcomingMatch["playerA"]): DirectoryPlayer => ({
      id: ref.id,
      name: ref.name,
      countryCode: ref.countryCode,
      country: null,
      tour: tourOf(m.category),
      gender: null,
      rank: null,
      points: null,
      movement: null,
      source: "schedule",
    });
    setPlayerA(mk(m.playerA));
    setPlayerB(mk(m.playerB));
    setScheduled(m);
    if (m.bestOf === 3 || m.bestOf === 5) setFormat(String(m.bestOf));
    if (m.surface.group) setSurface(m.surface.group);
    setData(null);
  }

  async function copyForAI() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.reportText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
      setReportVisible(true);
      setTimeout(() => reportRef.current?.select(), 50);
    }
  }

  function download(name: string, text: string, type: string) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const needsSetup = status !== null && !status.connected && !demo;

  return (
    <div className="wrap">
      <header className="top">
        <h1>
          <span className="ball">🎾</span> Tennis Match Prep
        </h1>
        <span className={`badge ${demo ? "demo" : status === null ? "" : status.connected ? "ok" : "bad"}`}>
          {demo ? "⚠ DEMO — NOT REAL MATCH DATA" : status === null ? "checking provider…" : status.connected ? `● ${status.label}` : "○ Data provider not connected"}
        </span>
        {status?.connected && !demo && (
          <button className="btn" onClick={() => void testKey()} disabled={probing} title="Shows which key/access level this deployment uses and fires one live request to the provider.">
            {probing ? "Testing key…" : "🔍 Test API key"}
          </button>
        )}
        <span className="spacer" />
        <label className="checkline" style={{ marginTop: 0 }} title="Synthetic data for trying the UI. Never used automatically.">
          <input
            type="checkbox"
            checked={demo}
            onChange={(e) => {
              setDemo(e.target.checked);
              setData(null);
              setPlayerA(null);
              setPlayerB(null);
              setScheduled(null);
            }}
          />
          Demo mode (synthetic, clearly labeled)
        </label>
      </header>

      {demo && <div className="notice demo">DEMO — NOT REAL MATCH DATA. Synthetic fixtures for interface testing only; also printed in exports.</div>}
      {diagnosis && !demo && (status?.connected ?? false) && (
        <div className={`notice ${diagnosis.probe ? (diagnosis.probe.ok ? "info" : "err") : "info"}`}>
          <b>Provider connection check.</b> This deployment is using key <code>{diagnosis.keyMasked}</code> at access level{" "}
          <b>{diagnosis.accessLevel}</b>
          {diagnosis.endpoint !== "(synthetic fixtures)" && (
            <>
              {" "}
              → <code style={{ fontSize: 12 }}>{diagnosis.endpoint}</code>
            </>
          )}
          {diagnosis.probe && (
            <div style={{ marginTop: 6 }}>
              Live probe: <b>{diagnosis.probe.httpStatus !== null ? `HTTP ${diagnosis.probe.httpStatus}` : "no response"}</b> — {diagnosis.probe.message}
            </div>
          )}
          {!diagnosis.probe && (
            <div style={{ marginTop: 6, color: "var(--muted)" }}>
              Click <b>Test API key</b> to fire one live request and confirm the provider accepts this key.
            </div>
          )}
        </div>
      )}
      {needsSetup && (
        <div className="notice warn">
          <b>Data provider not connected.</b> This app never shows sample data as real. To connect real data: create a
          free Sportradar trial key (marketplace.sportradar.com → add the Tennis API trial), then create{" "}
          <code>.env.local</code> next to <code>package.json</code> containing <code>SPORTRADAR_API_KEY=your_key</code>{" "}
          and restart the server. See README.md.
        </div>
      )}

      <div className="card">
        <div className="controls-grid">
          <PlayerSelect label="Player A" demo={demo} value={playerA} onChange={(p) => { setPlayerA(p); setScheduled(null); }} disabled={loading} />
          <PlayerSelect label="Player B" demo={demo} value={playerB} onChange={(p) => { setPlayerB(p); setScheduled(null); }} disabled={loading} />
        </div>
        <UpcomingPicker demo={demo} onPick={onUpcomingPick} onError={(msg) => setError({ message: msg, retryable: true })} />
        {scheduled && (
          <div className="notice info" style={{ marginTop: 10 }}>
            Scheduled match: <b>{scheduled.playerA.name} vs {scheduled.playerB.name}</b> · {scheduled.competition ?? "?"} ·{" "}
            {scheduled.round ?? "?"} · {scheduled.surface.raw ? scheduled.surface.raw.replace(/_/g, " ") : "surface unknown"} ·{" "}
            {scheduled.startTime ? new Date(scheduled.startTime).toUTCString().slice(0, 22) : "time unknown"} · best of{" "}
            {scheduled.bestOf ?? "?"} (filters were pre-filled from this fixture; adjust as needed)
          </div>
        )}

        <div className="filters">
          <SegRow label="Surface" value={surface} onChange={setSurface} options={[{ id: "hard", label: "Hard" }, { id: "clay", label: "Clay" }, { id: "grass", label: "Grass" }, { id: "all", label: "All" }]} />
          <SegRow label="Indoor / outdoor" value={environment} onChange={setEnvironment} options={[{ id: "all", label: "All" }, { id: "outdoor", label: "Outdoor" }, { id: "indoor", label: "Indoor" }]} />
          <SegRow label="Match format" value={format} onChange={setFormat} options={[{ id: "3", label: "Best of 3" }, { id: "5", label: "Best of 5" }, { id: "all", label: "All" }]} />
          <SegRow label="Date range" value={datePreset} onChange={setDatePreset} options={[{ id: "12m", label: "Last 12 months" }, { id: "season", label: "Current season" }, { id: "custom", label: "Custom" }]} />
          <SegRow label="Recent matches shown" value={recentCount} onChange={setRecentCount} options={[{ id: "4", label: "4" }, { id: "5", label: "5" }, { id: "10", label: "10" }]} />
        </div>
        {datePreset === "custom" && (
          <div className="filters">
            <div className="fgroup">
              <label className="f">From (yyyy-mm-dd)</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="fgroup">
              <label className="f">To (yyyy-mm-dd)</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
        )}
        <label className="checkline">
          <input type="checkbox" checked={recentAllSurfaces} onChange={(e) => setRecentAllSurfaces(e.target.checked)} />
          Also show an all-surfaces recent-form list (clearly labeled; never affects the surface-filtered aggregates)
        </label>

        <div className="actions">
          <button className="btn primary" disabled={loading || !playerA || !playerB} onClick={() => void fetchPrep(false)}>
            {loading ? "Fetching real stats…" : "⚡ FETCH STATS"}
          </button>
          <button className="btn" disabled={loading || !playerA || !playerB} onClick={() => void fetchPrep(true)} title="Bypass cache and pull fresh data from the provider">
            ↻ Refresh Data
          </button>
        </div>
        {loading && (
          <div className="progress-steps">
            Contacting provider (server-side)… first fetch can take ~10–40 s due to provider rate limits (about 1 request/second, incl. per-tournament surface lookups); later requests use the cache.
          </div>
        )}
        {error && (
          <div className="notice err">
            <b>{error.code === "not_configured" ? "Data provider not connected" : "Request failed"}.</b> {error.message}
            {(error.retryable ?? true) && error.code !== "not_configured" && (
              <button className="btn retry" onClick={() => void fetchPrep(false)} disabled={loading}>
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {!data && !loading && !error && (
        <div className="skel">
          Select Player A and Player B, tune the filters, then hit <b>FETCH STATS</b>.<br />
          <span style={{ color: "var(--muted)" }}>The app collects real matches, computes aggregates from raw counts, and builds one compact report for AI analysis.</span>
        </div>
      )}
      {loading && <div className="skel">⏳ Fetching and computing…</div>}

      {data && (
        <>
          <div className="card">
            <h3 className="sec" style={{ marginTop: 0 }}>Data provenance & coverage</h3>
            <div className="meta-line">
              <span>Source: <b>{data.meta.providerLabel}</b></span>
              <span>Retrieved: <b>{new Date(data.meta.retrievedAt).toUTCString()}</b></span>
              <span>Window: <b>{data.meta.filters.from}</b> → <b>{data.meta.filters.to}</b> (cutoff {new Date(data.meta.filters.cutoffIso).toUTCString().slice(0, 22)})</span>
            </div>
            {data.meta.demoBanner && <div className="notice demo" style={{ marginTop: 8 }}>{data.meta.demoBanner}</div>}
            {data.meta.scheduledMatch && (
              <div className="notice info" style={{ marginTop: 8 }}>
                Scheduled match per provider: {data.meta.scheduledMatch.competition ?? "?"}
                {data.meta.scheduledMatch.round ? `, ${data.meta.scheduledMatch.round}` : ""}
                {data.meta.scheduledMatch.startTime ? `, starts ${new Date(data.meta.scheduledMatch.startTime).toUTCString().slice(0, 22)}` : ""}
                {data.meta.scheduledMatch.surfaceLabel ? `, ${data.meta.scheduledMatch.surfaceLabel}` : ""}
              </div>
            )}
            <details className="sources">
              <summary>
                {data.meta.sources.length} provider request(s) — {data.meta.sources.filter((s) => s.fromCache).length} served from cache (click for times)
              </summary>
              {data.meta.sources.map((s, i) => (
                <div className="source-row" key={i}>
                  <span className="hit">{s.fromCache ? "cache" : "fresh"}</span>
                  <span>{new Date(s.fetchedAt).toUTCString()}</span>
                  <span>{s.description}</span>
                </div>
              ))}
            </details>
          </div>

          <div className="grid2">
            <PlayerPanel title="Player A" block={data.playerA} otherName={data.playerB.name} />
            <PlayerPanel title="Player B" block={data.playerB} otherName={data.playerA.name} />
          </div>

          <div className="card">
            <h3 className="sec" style={{ marginTop: 0 }}>Head-to-head</h3>
            {data.h2h.summary ? (
              <>
                <div className="h2h-line">
                  Overall (provider record{data.h2h.summary.earliest ? `, ${data.h2h.summary.earliest} → ${data.h2h.summary.latest}` : ""}):{" "}
                  <b>{data.h2h.summary.aWon}–{data.h2h.summary.bWon}</b> for {data.playerA.name}
                </div>
                <div className="h2h-line">
                  By surface: hard <b>{data.h2h.summary.bySurface.hard.aWon}–{data.h2h.summary.bySurface.hard.bWon}</b>, clay{" "}
                  <b>{data.h2h.summary.bySurface.clay.aWon}–{data.h2h.summary.bySurface.clay.bWon}</b>, grass{" "}
                  <b>{data.h2h.summary.bySurface.grass.aWon}–{data.h2h.summary.bySurface.grass.bWon}</b>
                  {data.h2h.summary.unknownSurfaceCount > 0 && <span className="unavail"> ({data.h2h.summary.unknownSurfaceCount} unknown-surface)</span>}
                </div>
                {data.h2h.matches.length > 0 && (
                  <details className="recent">
                    <summary>Meetings on record ({data.h2h.matches.length})</summary>
                    <table className="mtable">
                      <tbody>
                        {data.h2h.matches.map((m) => (
                          <tr key={m.id} className="mrow">
                            <td style={{ whiteSpace: "nowrap" }}>{m.date}</td>
                            <td>
                              {m.playerWon ? data.playerA.name : data.playerB.name} won {m.scoreText}
                            </td>
                            <td>{m.competition}</td>
                            <td>{m.surface}</td>
                            <td>{m.outcome !== "completed" ? m.outcome : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </>
            ) : (
              <div className="notice info">No previous meetings in provider record (or the head-to-head feed failed).</div>
            )}
          </div>

          <div className="card">
            <h3 className="sec" style={{ marginTop: 0 }}>Export for AI analysis</h3>
            <div className="exportbar">
              <button className="btn primary" onClick={() => void copyForAI()}>
                📋 Copy for AI
              </button>
              <button className="btn" onClick={() => download(`tennis-match-prep-${data.playerA.name}-vs-${data.playerB.name}.txt`, data.reportText, "text/plain")}>
                ⬇ Download TXT
              </button>
              <button
                className="btn"
                onClick={() => download(`tennis-match-prep-${data.playerA.name}-vs-${data.playerB.name}.json`, JSON.stringify(data, null, 2), "application/json")}
              >
                ⬇ Download JSON
              </button>
              <button className="btn" onClick={() => setReportVisible((v) => !v)}>
                {reportVisible ? "Hide report text" : "View report text"}
              </button>
              {copyState === "copied" && <span className="badge ok">copied ✓</span>}
              {copyState === "failed" && <span className="badge bad">clipboard blocked — select the text below manually</span>}
            </div>
            {reportVisible && <textarea ref={reportRef} className="report" readOnly value={data.reportText} onFocus={(e) => e.target.select()} />}
          </div>
        </>
      )}
    </div>
  );
}
