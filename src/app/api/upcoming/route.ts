import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/service";
import { ProviderError } from "@/lib/model";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const demo = req.nextUrl.searchParams.get("provider") === "demo";
  const days = Number(req.nextUrl.searchParams.get("days") ?? 2) || 2;
  const provider = getProvider(demo ? "demo" : "auto");
  if (!provider.connected) {
    return NextResponse.json({ ok: true, matches: [], demo, warning: "Data provider not connected" });
  }
  try {
    const { matches, traces } = await provider.getUpcomingMatches(days);
    return NextResponse.json({ ok: true, matches, demo, sources: traces });
  } catch (err) {
    const pe = err instanceof ProviderError ? err : null;
    return NextResponse.json(
      {
        ok: false,
        matches: [],
        error: {
          code: pe?.code ?? "network",
          message: `Upcoming matches failed: ${err instanceof Error ? err.message : String(err)}`,
          retryable: true,
        },
      },
      { status: pe?.code === "not_configured" ? 503 : 502 },
    );
  }
}
