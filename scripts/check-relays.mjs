// Usage: node scripts/check-relays.mjs <event-id-hex>
// Asks each relay for one event by id and says whether it HAS IT.
const RELAYS = ["wss://relay.damus.io", "wss://relay.nostr.band", "ws://localhost:7777"];
const TIMEOUT_MS = 6000;

const id = process.argv[2];
if (!/^[0-9a-f]{64}$/i.test(id ?? "")) {
  console.error("Usage: node scripts/check-relays.mjs <event-id-hex (64 chars)>");
  process.exit(1);
}

function check(url) {
  return new Promise((resolve) => {
    let settled = false;
    let ws;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws?.close(); } catch { /* already closed */ }
      resolve(result);
    };
    const timer = setTimeout(() => done("no answer"), TIMEOUT_MS);
    try { ws = new WebSocket(url); } catch { return done("no answer"); }
    const sub = "check-" + Math.random().toString(36).slice(2, 8);
    ws.addEventListener("open", () => ws.send(JSON.stringify(["REQ", sub, { ids: [id.toLowerCase()], limit: 1 }])));
    ws.addEventListener("error", () => done("no answer"));
    ws.addEventListener("close", () => done("no answer"));
    ws.addEventListener("message", (msg) => {
      let data;
      try { data = JSON.parse(String(msg.data)); } catch { return; }
      if (!Array.isArray(data)) return;
      if (data[0] === "EVENT" && data[1] === sub && data[2]?.id === id.toLowerCase()) done("HAS IT");
      else if (data[0] === "EOSE" && data[1] === sub) done("not found");
      else if (data[0] === "CLOSED" && data[1] === sub) done("rejected"); // e.g. auth-required, blocked
      else if (data[0] === "NOTICE") done("rejected");
    });
  });
}

const results = await Promise.all(RELAYS.map(async (r) => [r, await check(r)]));
for (const [relay, result] of results) console.log(`${relay.padEnd(26)} ${result}`);
process.exit(0);
