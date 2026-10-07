import { finalizeEvent } from "nostr-tools";
import { unlockIdentity } from "../../features/identity/keys";

export type LiveKitRole = "host" | "listener";

export type LiveKitSession = {
  token: string;
  serverUrl: string;
  identity: string;
  role: LiveKitRole;
  roomName: string;
};

const tokenEndpoint = import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT ?? "http://localhost:3001/api/livekit/token";

function hexToBytes(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)?.map((value) => Number.parseInt(value, 16)) ?? []);
}

export async function requestLiveKitToken(roomName: string, role: LiveKitRole): Promise<LiveKitSession> {
  let response: Response;
  const challengeEndpoint = new URL("/api/livekit/challenge", tokenEndpoint);
  let challengeResponse: Response;

  try {
    challengeResponse = await fetch(challengeEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomName, role }),
    });
  } catch {
    throw new Error("Cannot reach the LiveKit token service. Run npm run dev:token in a second terminal.");
  }

  const challengePayload = await challengeResponse.json() as { challenge?: string; error?: string };
  if (!challengeResponse.ok || !challengePayload.challenge) throw new Error(challengePayload.error ?? "Unable to start signed authentication.");
  const { privateKeyHex } = await unlockIdentity();
  const authEvent = finalizeEvent({
    kind: 27235, created_at: Math.floor(Date.now() / 1000), content: "",
    tags: [["u", tokenEndpoint], ["method", "POST"], ["challenge", challengePayload.challenge]],
  }, hexToBytes(privateKeyHex));

  try {
    response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomName, role, authEvent }),
    });
  } catch {
    throw new Error("Cannot reach the LiveKit token service. Run npm run dev:token in a second terminal.");
  }

  const payload = await response.json() as Partial<LiveKitSession> & { error?: string };

  if (!response.ok || !payload.token || !payload.serverUrl || !payload.identity || !payload.role) {
    throw new Error(payload.error ?? "Unable to connect to LiveKit.");
  }

  return { ...payload, roomName } as LiveKitSession;
}
