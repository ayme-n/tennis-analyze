import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/service";
import { ProviderError } from "@/lib/model";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const demo = req.nextUrl.searchParams.get("provider") === "demo";
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  const provider = getProvider(demo ? "demo" : "auto");
  if (q.length < 2) {
    return NextResponse.json({ ok: true, players: [], demo });
  }
  if (!provider.connected) {
    return NextResponse.json({
      ok: true,
      players: [],
      demo,
      warning: "Data provider not connected",
    });
  }
  try {
    const players = await provider.searchPlayers(q);
    const json: Record<string, unknown> = { ok: true, players, demo };
    if (debug && provider.directoryStats) {
      // Debug aid for "no players found": show what the directory actually contains.
      json.debug = await provider
        .directoryStats()
        .then(({ size, sample }) => ({ directorySize: size, sampleNames: sample }))
        .catch((e: unknown) => ({ directorySize: null, error: e instanceof Error ? e.message : String(e) }));
    }
    return NextResponse.json(json);
  } catch (err) {
    const pe = err instanceof ProviderError ? err : null;
    return NextResponse.json(
      {
        ok: false,
        players: [],
        error: {
          code: pe?.code ?? "network",
          message: `Player search failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      },
      { status: 502 },
    );
  }
}
