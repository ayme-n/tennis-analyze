"use client";

import { useState } from "react";
import type { UpcomingMatch } from "@/lib/model";

interface Props {
  demo: boolean;
  onPick: (m: UpcomingMatch) => void;
  onError: (msg: string) => void;
}

export default function UpcomingPicker({ demo, onPick, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<UpcomingMatch[] | null>(null);

  async function load() {
    setLoading(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/upcoming?days=3&provider=${demo ? "demo" : "auto"}`);
      const data = await res.json();
      if (data.ok) {
        setMatches(data.matches ?? []);
        if ((data.matches ?? []).length === 0 && data.warning) onError(data.warning);
      } else {
        setMatches([]);
        onError(data.error?.message ?? "could not load upcoming matches");
      }
    } catch (e) {
      setMatches([]);
      onError(`could not load upcoming matches: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button className="btn" onClick={() => (open ? setOpen(false) : void load())} type="button">
        📅 {open ? "Hide upcoming matches" : "Fill from an upcoming match…"}
      </button>
      {open && (
        <div style={{ marginTop: 4 }}>
          {loading && <div className="notice info">Loading singles matches scheduled in the next 3 days (UTC)…</div>}
          {!loading && matches && matches.length === 0 && (
            <div className="notice info">No upcoming singles fixtures found in the next 3 days.</div>
          )}
          {!loading &&
            matches?.slice(0, 30).map((m) => (
              <button
                key={m.id}
                type="button"
                className="upcoming-item"
                onClick={() => {
                  onPick(m);
                  setOpen(false);
                }}
              >
                <span className="vs">
                  {m.playerA.name} vs {m.playerB.name}
                </span>
                <span className="sub">
                  {m.competition ?? "?"} · {m.round ?? "?"} · {m.surface.raw ? m.surface.raw.replace(/_/g, " ") : "surface unknown"} ·{" "}
                  {m.startTime ? new Date(m.startTime).toUTCString().slice(0, 22) : "time unknown"} · best of {m.bestOf ?? "?"}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
