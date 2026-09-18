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
    <div>
      <button className="btn" onClick={() => (open ? setOpen(false) : void load())} type="button">
        {open ? "Hide upcoming matches" : "Pick from upcoming matches"}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {loading && <div className="notice info">Loading the next 3 days of singles fixtures…</div>}
          {!loading && matches && matches.length === 0 && (
            <div className="notice info">No upcoming singles fixtures in the next 3 days.</div>
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
                  {m.competition ?? "?"} · {m.round ?? "?"} · {m.surface.raw ? m.surface.raw.replace(/_/g, " ") : "surface tbc"} ·{" "}
                  {m.startTime ? new Date(m.startTime).toUTCString().slice(0, 22) : "time tbc"} · Bo{m.bestOf ?? "?"}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
