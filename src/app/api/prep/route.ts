import { NextRequest, NextResponse } from "next/server";
import { buildPrepResponse, PrepInputError, type PrepRequest } from "@/lib/service";
import { ProviderError } from "@/lib/model";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // provider is throttled for trial-friendly rates

export async function POST(req: NextRequest) {
  let body: PrepRequest;
  try {
    body = (await req.json()) as PrepRequest;
  } catch {
    return NextResponse.json({ ok: false, error: { code: "bad_request", message: "Request body must be JSON." } }, { status: 400 });
  }
  try {
    const res = await buildPrepResponse(body);
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof PrepInputError) {
      return NextResponse.json({ ok: false, error: { code: "bad_request", message: err.message } }, { status: 400 });
    }
    if (err instanceof ProviderError) {
      const status = err.code === "not_configured" ? 503 : err.code === "auth_failed" ? 401 : 502;
      return NextResponse.json(
        { ok: false, error: { code: err.code, message: err.message, retryable: err.code !== "not_configured" && err.code !== "auth_failed" } },
        { status },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "network", message: `Unexpected failure: ${err instanceof Error ? err.message : String(err)}`, retryable: true } },
      { status: 502 },
    );
  }
}
