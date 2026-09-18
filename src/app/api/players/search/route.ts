import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/service";
import { ProviderError } from "@/lib/model";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const demo = req.nextUrl.searchParams.get("provider") === "demo";
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
    return NextResponse.json({ ok: true, players, demo });
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
