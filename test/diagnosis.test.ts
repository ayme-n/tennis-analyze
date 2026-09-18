import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SportradarProvider,
  loadSportradarConfig,
  maskKey,
  sanitizeApiKey,
} from "@/lib/providers/sportradar/index";

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  process.env.SPORTRADAR_API_KEY = "test-key-0123456789";
  process.env.SPORTRADAR_ACCESS_LEVEL = "trial";
  process.env.PROVIDER_MIN_INTERVAL_MS = "0";
  process.env.PROVIDER_TIMEOUT_MS = "4000";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SPORTRADAR_API_KEY;
  delete process.env.SPORTRADAR_ACCESS_LEVEL;
});

describe("API key hygiene", () => {
  it("sanitizeApiKey trims, strips wrapping quotes and stray whitespace", () => {
    expect(sanitizeApiKey("  abc123  ")).toBe("abc123");
    expect(sanitizeApiKey('"abc123"')).toBe("abc123");
    expect(sanitizeApiKey("'abc123'")).toBe("abc123");
    expect(sanitizeApiKey("abc 123\n")).toBe("abc123");
    expect(sanitizeApiKey(undefined)).toBe("");
    expect(sanitizeApiKey(null)).toBe("");
    // a single quote inside the key is preserved
    expect(sanitizeApiKey("ab'c123")).toBe("ab'c123");
  });

  it("quoted env values survive loadSportradarConfig cleaned", () => {
    process.env.SPORTRADAR_API_KEY = '"  mykey-xyz  "';
    expect(loadSportradarConfig().apiKey).toBe("mykey-xyz");
  });

  it("accepts 'prod' as an alias for production access level", () => {
    process.env.SPORTRADAR_ACCESS_LEVEL = "prod";
    expect(loadSportradarConfig().accessLevel).toBe("production");
    process.env.SPORTRADAR_ACCESS_LEVEL = "PRODUCTION";
    expect(loadSportradarConfig().accessLevel).toBe("production");
    process.env.SPORTRADAR_ACCESS_LEVEL = "anything-else";
    expect(loadSportradarConfig().accessLevel).toBe("trial");
  });

  it("maskKey never reveals the full key", () => {
    expect(maskKey("")).toBe("(not set)");
    expect(maskKey("short")).toBe("•••• (5 chars)");
    const m = maskKey("abcdefghij1234567890");
    expect(m).toBe("abcd…7890 (20 chars)");
    expect(m).not.toContain("abcdefghij1234567890");
  });
});

describe("provider diagnosis", () => {
  it("without probe: reports masked key, access level and endpoint — no network call", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const p = new SportradarProvider();
    const d = await p.diagnose(false);
    expect(d.connected).toBe(true);
    expect(d.keyMasked).toContain("19 chars");
    expect(d.accessLevel).toBe("trial");
    expect(d.endpoint).toBe("https://api.sportradar.com/tennis/trial/v3/en/rankings.json");
    expect(d.probe).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
    // the raw key must never appear in the diagnosis payload
    expect(JSON.stringify(d)).not.toContain("test-key-0123456789");
  });

  it("probe=true fires exactly one live request and interprets a 403 as rejection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse(403, { error: "Forbidden" })));
    const p = new SportradarProvider();
    const d = await p.diagnose(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(d.probe).toMatchObject({ ok: false, httpStatus: 403 });
    expect(d.probe?.message).toContain("rejected");
  });

  it("probe=true interprets 200 as accepted and 429 as quota", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse(200, { rankings: [] })));
    let d = await new SportradarProvider().diagnose(true);
    expect(d.probe).toMatchObject({ ok: true, httpStatus: 200 });

    vi.stubGlobal("fetch", vi.fn(async () => makeResponse(429, {})));
    d = await new SportradarProvider().diagnose(true);
    expect(d.probe).toMatchObject({ ok: false, httpStatus: 429 });
    expect(d.probe?.message).toContain("quota");
  });

  it("no key: not connected, and probe requests do not hit the network", async () => {
    delete process.env.SPORTRADAR_API_KEY;
    vi.stubGlobal("fetch", vi.fn());
    const p = new SportradarProvider();
    const d = await p.diagnose(true);
    expect(d.connected).toBe(false);
    expect(d.keyMasked).toBe("(not set)");
    expect(d.probe).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
