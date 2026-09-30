export type LiveKitRole = "host" | "listener";

export type LiveKitSession = {
  token: string;
  serverUrl: string;
  identity: string;
  role: LiveKitRole;
  roomName: string;
};

const tokenEndpoint = import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT ?? "http://localhost:3001/api/livekit/token";

export async function requestLiveKitToken(roomName: string, role: LiveKitRole): Promise<LiveKitSession> {
  let response: Response;

  try {
    response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomName, role }),
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
