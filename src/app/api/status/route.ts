import { NextResponse } from "next/server";
import { getProvider } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = getProvider("auto");
  const s = await provider.status();
  return NextResponse.json({
    ok: true,
    provider: { id: provider.id, label: provider.label, connected: s.connected, detail: s.detail },
    demoAvailable: true,
    keyHint: s.connected
      ? null
      : "Set SPORTRADAR_API_KEY in .env.local (free trial key: marketplace.sportradar.com -> Tennis API), then restart the server.",
  });
}
