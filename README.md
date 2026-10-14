# Atlas of Plant Based: PCT data MCP server

A read-only MCP server for Pacific Crest Trail data from atlasofplantbased.com: the 26 legs of a 2021 thru-hike with trail miles, towns, passes and lakes by mile, and vegan resupply at 64 common stops with the date each row was last checked.

Endpoint: https://atlasofplantbased.com/mcp (Streamable HTTP, stateless, no auth)
Server card: https://atlasofplantbased.com/.well-known/mcp/server-card.json
Same data as JSON: https://atlasofplantbased.com/api/ (OpenAPI at /openapi.json)

## Tools

- get_pct_leg: one of the 26 legs, with FarOut trail miles, length, 2021 days and dates, and the page that covers it
- find_by_trail_mile: the leg and the nearest towns, passes and lakes for any trail mile, 0 to 2656.4
- vegan_resupply: what each stop carries, whether a mailed box is advised, and the date it was last checked; search by town or mile range
- list_pct_points: towns, passes, lakes and peaks with mile, coordinates and trail height

## Try it

curl -X POST https://atlasofplantbased.com/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"vegan_resupply","arguments":{"town":"Idyllwild"}}}'

## How it runs

mcp.js is a Cloudflare Pages Function. It answers JSON-RPC at /mcp and reads the static JSON the site publishes under /api/pct/. Nothing is written, nothing is logged beyond Cloudflare's defaults, and there are no accounts or keys.

## Data

Walked in 2021, April 30 to September 5, by Jeffrey Combs (trail name Atlas). Resupply rows are rechecked against hiker reports and the businesses' own pages; each row carries its lastVerified date. Free to use with a link to the source page.
