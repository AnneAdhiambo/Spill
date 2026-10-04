import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { AccessToken } from "livekit-server-sdk";
import { verifyEvent } from "nostr-tools";
import { Wallet, normalizeMintUrl, serializeSwapPreview, deserializeSwapPreview } from "@cashu/cashu-ts";

const { Pool } = pg;
const port = Number(process.env.TOKEN_SERVER_PORT ?? 3001);
const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:5173";
const serverUrl = process.env.LIVEKIT_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const allowDemoHost = process.env.LIVEKIT_DEMO_ALLOW_HOST === "true";
const configuredMint = process.env.CASHU_MINT_URL ? normalizeMintUrl(process.env.CASHU_MINT_URL) : undefined;
const premiumRooms = new Set((process.env.PREMIUM_ROOM_IDS ?? "").split(",").map((room) => room.trim()).filter(Boolean));
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : undefined;
const challenges = new Map();
const CHALLENGE_TTL_MS = 60_000;
const AUTH_MAX_AGE_SECONDS = 60;

function allowedOrigin(request) {
  const origin = request.headers.origin;
  return origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ? origin : appOrigin;
}

function send(request, response, status, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) reject(new Error("Request body is too large."));
    });
    request.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("Request body must be valid JSON.")); }
    });
  });
}

function validRoomName(value) { return typeof value === "string" && /^[a-z0-9-]{3,80}$/.test(value); }
function tag(event, name) { return event.tags?.find((item) => item[0] === name)?.[1]; }
function endpointUrl(request) { return new URL(request.url, `http://${request.headers.host}`).toString(); }

function issueChallenge(body, request) {
  if (!validRoomName(body.roomName)) throw new Error("Room name must use 3–80 lowercase letters, numbers, or hyphens.");
  const role = body.role === "host" ? "host" : "listener";
  const challenge = randomBytes(32).toString("base64url");
  challenges.set(challenge, { roomName: body.roomName, role, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  return { challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString() };
}

function verifyNostrAuth(body, request) {
  const event = body.authEvent;
  if (!event || event.kind !== 27235 || !Array.isArray(event.tags) || !verifyEvent(event)) throw new Error("A valid signed Nostr HTTP-auth event is required.");
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(event.created_at) || Math.abs(now - event.created_at) > AUTH_MAX_AGE_SECONDS) throw new Error("Nostr authentication event has expired.");
  if (tag(event, "u") !== endpointUrl(request) || tag(event, "method") !== "POST") throw new Error("Nostr authentication event is bound to a different request.");
  const challenge = tag(event, "challenge");
  const pending = challenge && challenges.get(challenge);
  if (!pending || pending.expiresAt < Date.now()) throw new Error("Authentication challenge is invalid or expired.");
  if (pending.roomName !== body.roomName || pending.role !== (body.role === "host" ? "host" : "listener")) throw new Error("Authentication challenge does not match this room request.");
  challenges.delete(challenge);
  return event.pubkey;
}

async function hasActiveEntitlement(roomName, pubkey) {
  if (!premiumRooms.has(roomName)) return true;
  if (!pool) throw new Error("Premium rooms require DATABASE_URL.");
  const result = await pool.query(
    `SELECT 1 FROM room_entitlements WHERE room_id = $1 AND nostr_pubkey = $2 AND status = 'active' AND expires_at > now() LIMIT 1`,
    [roomName, pubkey],
  );
  return result.rowCount === 1;
}

function encryptionKey() {
  const value = process.env.CASHU_PLATFORM_PROOF_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) throw new Error("CASHU_PLATFORM_PROOF_ENCRYPTION_KEY must be a 32-byte hex secret.");
  return Buffer.from(value, "hex");
}
function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decrypt(value) {
  const [iv, authTag, ciphertext] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

async function redeemPremiumPayment(body) {
  if (!pool || !configuredMint) throw new Error("Premium Cashu payments are not configured.");
  if (typeof body.paymentRequestId !== "string" || typeof body.token !== "string" || body.token.length > 90_000) throw new Error("Invalid premium payment.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const request = await client.query("SELECT * FROM premium_payment_requests WHERE id = $1 FOR UPDATE", [body.paymentRequestId]);
    if (request.rowCount !== 1 || request.rows[0].nostr_pubkey !== body.nostrPubkey) throw new Error("Payment request not found.");
    const payment = request.rows[0];
    if (payment.status === "settled") { await client.query("COMMIT"); return { status: "settled" }; }
    if (payment.expires_at <= new Date()) throw new Error("Payment request has expired.");
    const privateKey = process.env.CASHU_PLATFORM_P2PK_PRIVATE_KEY;
    if (!privateKey || !/^[0-9a-f]{64}$/i.test(privateKey)) throw new Error("Platform Cashu P2PK key is not configured.");
    const wallet = new Wallet(configuredMint, { unit: "sat" });
    await wallet.loadMint();
    const decoded = wallet.decodeToken(body.token);
    if (normalizeMintUrl(decoded.mint) !== configuredMint || decoded.unit !== "sat") throw new Error("Cashu token mint or unit is not allowed.");
    let preview;
    if (payment.swap_preview_ciphertext) {
      preview = deserializeSwapPreview(JSON.parse(await decrypt(payment.swap_preview_ciphertext)));
    } else {
      preview = await wallet.prepareSwapToReceive(body.token, { privkey: privateKey, requireDleq: true });
      const received = preview.amount - preview.fees;
      if (received < BigInt(payment.amount_sats)) throw new Error("Cashu payment amount is insufficient after mint fees.");
      await client.query("UPDATE premium_payment_requests SET status = 'redeeming', swap_preview_ciphertext = $2 WHERE id = $1", [payment.id, encrypt(JSON.stringify(serializeSwapPreview(preview)))]);
    }
    await client.query("COMMIT");
    const { keep } = await wallet.completeSwap(preview);
    const settledProofs = encrypt(JSON.stringify(keep));
    const completion = await pool.query(
      `WITH settled AS (
        UPDATE premium_payment_requests SET status = 'settled', settled_at = now(), redemption_ciphertext = $2, swap_preview_ciphertext = NULL WHERE id = $1 AND status = 'redeeming' RETURNING *
      ) INSERT INTO room_entitlements (id, room_id, nostr_pubkey, status, granted_at, expires_at, payment_reference)
      SELECT $3, room_id, nostr_pubkey, 'active', now(), now() + (COALESCE(NULLIF(current_setting('app.premium_entitlement_seconds', true), ''), '2592000') || ' seconds')::interval, id FROM settled
      ON CONFLICT (payment_reference) DO NOTHING`,
      [body.paymentRequestId, settledProofs, randomUUID()],
    );
    if (completion.rowCount === 0) throw new Error("Payment settlement could not be recorded.");
    return { status: "settled" };
  } finally { client.release(); }
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(request, response, 204, {});
  if (request.method === "GET" && request.url === "/api/cashu/config") return configuredMint ? send(request, response, 200, { mintUrl: configuredMint }) : send(request, response, 503, { error: "Cashu mint is not configured." });
  if (request.method !== "POST") return send(request, response, 404, { error: "Not found." });
  try {
    const body = await readJson(request);
    if (request.url === "/api/livekit/challenge") return send(request, response, 200, issueChallenge(body, request));
    if (request.url === "/api/livekit/token") {
      if (!serverUrl || !apiKey || !apiSecret) return send(request, response, 503, { error: "LiveKit is not configured. Add credentials to .env.local." });
      if (!validRoomName(body.roomName)) return send(request, response, 400, { error: "Room name must use 3–80 lowercase letters, numbers, or hyphens." });
      const role = body.role === "host" ? "host" : "listener";
      const pubkey = verifyNostrAuth(body, request);
      if (role === "host" && !allowDemoHost) return send(request, response, 403, { error: "Host tokens require authorization. Enable the local demo setting only for testing." });
      if (role === "listener" && !(await hasActiveEntitlement(body.roomName, pubkey))) return send(request, response, 403, { error: "An active premium-room entitlement is required." });
      const identity = `${role}-${pubkey.slice(0, 16)}`;
      const token = new AccessToken(apiKey, apiSecret, { identity, ttl: "1h" });
      token.addGrant({ roomJoin: true, room: body.roomName, canPublish: role === "host", canSubscribe: true, canPublishData: false });
      return send(request, response, 200, { token: await token.toJwt(), serverUrl, identity, role });
    }
    if (request.url === "/api/premium/redeem") {
      // Cashu bearer material is intentionally never included in errors or logs.
      return send(request, response, 200, await redeemPremiumPayment(body));
    }
    return send(request, response, 404, { error: "Not found." });
  } catch (error) {
    return send(request, response, 400, { error: error instanceof Error ? error.message : "Unable to process request." });
  }
});

server.listen(port, allowDemoHost ? "127.0.0.1" : undefined, () => console.log(`LiveKit token service listening on http://localhost:${port}`));
