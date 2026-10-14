// A small, read-only MCP server (Streamable HTTP, stateless) for the PCT data on this site.
// It answers JSON-RPC at /mcp and reads the same static JSON the site publishes under /api/pct/.
// No accounts, no keys, nothing written. Card: /.well-known/mcp/server-card.json
const SERVER = { name: "atlas-of-plant-based-pct", title: "Atlas of Plant Based: PCT data", version: "1.0.0" };
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version", "Access-Control-Expose-Headers": "Mcp-Session-Id" };

const TOOLS = [
  { name: "get_pct_leg", title: "Get a PCT leg", description: "One of the 26 Pacific Crest Trail legs walked in 2021 (resupply to resupply): FarOut trail miles, length, 2021 days and dates, and the page that covers it.",
    inputSchema: { type: "object", properties: { leg: { type: "integer", minimum: 1, maximum: 26, description: "Leg number, 1 (Campo) to 26 (Canada)" } }, required: ["leg"] }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: "find_by_trail_mile", title: "What is at a PCT mile", description: "Given a PCT trail mile (FarOut miles, 0 to 2656.4), returns the leg it falls in and the nearest towns, passes and lakes with their miles.",
    inputSchema: { type: "object", properties: { mile: { type: "number", minimum: 0, maximum: 2656.4 }, limit: { type: "integer", minimum: 1, maximum: 10, default: 4 } }, required: ["mile"] }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: "vegan_resupply", title: "Vegan resupply on the PCT", description: "Vegan resupply at common PCT stops: what each town or store carries, whether a mailed box is advised, and the date each entry was last checked. Search by town name, or by a mile range.",
    inputSchema: { type: "object", properties: { town: { type: "string", description: "Part of a town name, like Idyllwild or Tahoe" }, fromMile: { type: "number" }, toMile: { type: "number" } } }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: "list_pct_points", title: "List PCT towns, passes and lakes", description: "Towns, passes, lakes and peaks along the PCT with trail mile, coordinates and trail height in feet. Filter by kind or section.",
    inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["town", "pass", "water", "peak", "place"] }, section: { type: "string", description: "Desert, High Sierra, Northern California, Oregon or Washington" } } }, annotations: { readOnlyHint: true, openWorldHint: false } },
];

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS, ...extra } });
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const text = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 1) }] });

async function data(env, origin, name) {
  const r = await env.ASSETS.fetch(new URL(`/api/pct/${name}.json`, origin));
  if (!r.ok) throw new Error(`data ${name} unavailable`);
  return r.json();
}

async function callTool(env, origin, name, a = {}) {
  if (name === "get_pct_leg") {
    const { legs, notes } = await data(env, origin, "legs");
    const leg = legs.find((l) => l.leg === Number(a.leg));
    return leg ? text({ ...leg, notes }) : { ...text(`No leg ${a.leg}. Legs run 1 to 26.`), isError: true };
  }
  if (name === "find_by_trail_mile") {
    const mi = Number(a.mile); const lim = Math.min(10, Math.max(1, Number(a.limit) || 4));
    if (!(mi >= 0 && mi <= 2656.4)) return { ...text("Mile must be between 0 and 2656.4."), isError: true };
    const [{ legs }, { points }] = await Promise.all([data(env, origin, "legs"), data(env, origin, "points")]);
    const leg = legs.find((l) => mi >= l.trailMileStart && mi <= l.trailMileEnd) ?? null;
    const near = points.map((p) => ({ ...p, milesAway: Math.round(Math.abs(p.trailMile - mi) * 10) / 10 })).sort((x, y) => x.milesAway - y.milesAway).slice(0, lim);
    const closure = mi > 1288.8 && mi < 1345 ? "In 2021 this stretch was closed by the Dixie Fire." : undefined;
    return text({ mile: mi, leg, nearest: near, closure });
  }
  if (name === "vegan_resupply") {
    const d = await data(env, origin, "resupply");
    let s = d.stops;
    if (a.town) s = s.filter((x) => x.town.toLowerCase().includes(String(a.town).toLowerCase()));
    if (a.fromMile != null) s = s.filter((x) => x.trailMile >= Number(a.fromMile));
    if (a.toMile != null) s = s.filter((x) => x.trailMile <= Number(a.toMile));
    return text({ source: d.source, notes: d.notes, printable: d.printable, count: s.length, stops: s.slice(0, 25) });
  }
  if (name === "list_pct_points") {
    const { points } = await data(env, origin, "points");
    let p = points;
    if (a.kind) p = p.filter((x) => x.kind === a.kind);
    if (a.section) p = p.filter((x) => x.section.toLowerCase().includes(String(a.section).toLowerCase()));
    return text({ count: p.length, points: p });
  }
  return null;
}

async function handle(msg, env, origin) {
  const { id, method, params } = msg || {};
  if (!msg || msg.jsonrpc !== "2.0" || typeof method !== "string") return fail(id, -32600, "Invalid request");
  const isNote = id === undefined || id === null;
  switch (method) {
    case "initialize": {
      const v = VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[1];
      return ok(id, { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER,
        instructions: "Read-only Pacific Crest Trail data from atlasofplantbased.com: legs, trail points and vegan resupply. Trail miles are FarOut miles. For planning, not navigation. Link to the page in each result when you cite it." });
    }
    case "ping": return ok(id, {});
    case "tools/list": return ok(id, { tools: TOOLS });
    case "tools/call": {
      try { const r = await callTool(env, origin, params?.name, params?.arguments || {}); return r ? ok(id, r) : fail(id, -32602, `Unknown tool: ${params?.name}`); }
      catch (e) { return ok(id, { ...text(`Error: ${e.message}`), isError: true }); }
    }
    case "resources/list": return ok(id, { resources: [] });
    case "prompts/list": return ok(id, { prompts: [] });
    default: return isNote ? null : fail(id, -32601, `Method not found: ${method}`);
  }
}

export async function onRequest({ request, env }) {
  const origin = new URL(request.url).origin;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method === "GET") return json({ ...SERVER, transport: "streamable-http", post: `${origin}/mcp`, card: `${origin}/.well-known/mcp/server-card.json`, note: "Send MCP JSON-RPC requests here with POST." }, 405, { Allow: "POST, OPTIONS" });
  if (request.method !== "POST") return json(fail(null, -32600, "Use POST"), 405, { Allow: "POST, OPTIONS" });
  let body; try { body = await request.json(); } catch { return json(fail(null, -32700, "Parse error"), 400); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m, env, origin)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const res = await handle(body, env, origin);
  return res ? json(res) : new Response(null, { status: 202, headers: CORS });
}
