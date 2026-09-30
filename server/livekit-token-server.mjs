import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";

const port = Number(process.env.TOKEN_SERVER_PORT ?? 3001);
const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:5173";
const serverUrl = process.env.LIVEKIT_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const allowDemoHost = process.env.LIVEKIT_DEMO_ALLOW_HOST === "true";

function allowedOrigin(request) {
  const origin = request.headers.origin;

  if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    return origin;
  }

  return appOrigin;
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
      if (raw.length > 10_000) reject(new Error("Request body is too large."));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
  });
}

function validRoomName(value) {
  return typeof value === "string" && /^[a-z0-9-]{3,80}$/.test(value);
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    send(request, response, 204, {});
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/livekit/token") {
    send(request, response, 404, { error: "Not found." });
    return;
  }

  if (!serverUrl || !apiKey || !apiSecret) {
    send(request, response, 503, { error: "LiveKit is not configured. Add credentials to .env.local." });
    return;
  }

  try {
    const body = await readJson(request);
    const role = body.role === "host" ? "host" : "listener";

    if (!validRoomName(body.roomName)) {
      send(request, response, 400, { error: "Room name must use 3–80 lowercase letters, numbers, or hyphens." });
      return;
    }

    if (role === "host" && !allowDemoHost) {
      send(request, response, 403, { error: "Host tokens require authorization. Enable the local demo setting only for testing." });
      return;
    }

    const identity = `${role === "host" ? "host" : "listener"}-${randomUUID().slice(0, 12)}`;
    const token = new AccessToken(apiKey, apiSecret, { identity, ttl: "1h" });
    token.addGrant({
      roomJoin: true,
      room: body.roomName,
      canPublish: role === "host",
      canSubscribe: true,
      canPublishData: false,
    });

    send(request, response, 200, {
      token: await token.toJwt(),
      serverUrl,
      identity,
      role,
    });
  } catch (error) {
    send(request, response, 400, { error: error instanceof Error ? error.message : "Unable to create a token." });
  }
});

server.listen(port, () => {
  console.log(`LiveKit token service listening on http://localhost:${port}`);
});
