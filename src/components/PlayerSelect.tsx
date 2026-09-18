"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DirectoryPlayer } from "@/lib/model";

interface Props {
  label: string;
  demo: boolean;
  value: DirectoryPlayer | null;
  disabled?: boolean;
  onChange: (p: DirectoryPlayer | null) => void;
}

export function playerLabel(p: DirectoryPlayer): string {
  const bits = [p.name];
  const meta: string[] = [];
  if (p.tour) meta.push(p.tour);
  if (p.rank !== null) meta.push(`#${p.rank}`);
  if (p.countryCode) meta.push(p.countryCode);
  if (meta.length) bits.push(`(${meta.join(" · ")})`);
  return bits.join(" ");
}

export default function PlayerSelect({ label, demo, value, disabled, onChange }: Props) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<DirectoryPlayer[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    async (query: string) => {
      if (query.trim().length < 2) {
        setOptions([]);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(query)}&provider=${demo ? "demo" : "auto"}`);
        const data = await res.json();
        if (data.ok) {
          setOptions(data.players ?? []);
          setError(null);
        } else {
          setOptions([]);
          setError(data.error?.message ?? "search failed");
        }
      } catch (e) {
        setOptions([]);
        setError(`search failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
    },
    [demo],
  );

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!open) return;
    setLoading(true);
    timer.current = setTimeout(() => void run(q), 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, open, run]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="psearch" ref={boxRef}>
      <label className="f">{label}</label>
      <input
        type="text"
        placeholder="Search player…"
        value={value ? playerLabel(value) : q}
        disabled={disabled}
        onChange={(e) => {
          if (value) onChange(null);
          setQ(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={() => {
          if (!value) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && activeIdx >= 0 && options[activeIdx]) {
            onChange(options[activeIdx]);
            setOpen(false);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-label={label}
        role="combobox"
        aria-expanded={open}
      />
      {value && (
        <span className="selected-player">
          {playerLabel(value)}
          <button onClick={() => { onChange(null); setQ(""); }} aria-label="clear selection">✕</button>
        </span>
      )}
      {open && !value && (q.trim().length >= 2 || error) && (
        <div className="plist" role="listbox">
          {loading && <div className="empty">Searching…</div>}
          {error && <div className="empty">{error}</div>}
          {!loading && !error && options.length === 0 && (
            <div className="empty">
              No ranked singles players match “{q}” — try a full or last name. If even top players return nothing,
              use “Test key” / “Clear cache” in the header.
            </div>
          )}
          {options.map((p, i) => (
            <button
              key={p.id}
              role="option"
              aria-selected={i === activeIdx}
              className={i === activeIdx ? "active" : ""}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            >
              {p.name} <span className="sub">{[p.tour, p.rank !== null ? `#${p.rank}` : "unranked", p.countryCode, p.source === "schedule" ? "upcoming" : p.source === "extra" ? "added" : null].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
