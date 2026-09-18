import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * Provider status. With `?probe=1` the server additionally fires ONE real
 * request to the provider and reports how the key was received — useful to
 * verify deployments (e.g. on Vercel) without ever exposing the key itself
 * (only a short mask is returned).
 */
export async function GET(req: NextRequest) {
  const probe = req.nextUrl.searchParams.get("probe") === "1";
  const provider = getProvider("auto");
  const s = await provider.status();
  const diagnosis = provider.diagnose ? await provider.diagnose(probe) : null;
  return NextResponse.json({
    ok: true,
    provider: { id: provider.id, label: provider.label, connected: s.connected, detail: s.detail },
    demoAvailable: true,
    diagnosis,
    keyHint: s.connected
      ? null
      : "Set SPORTRADAR_API_KEY in .env.local (free trial key: marketplace.sportradar.com -> Tennis API), then restart the server. On Vercel: add the env var in Project Settings -> Environment Variables and REDEPLOY.",
  });
}
