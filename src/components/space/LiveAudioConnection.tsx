import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant } from "@livekit/components-react";
import { Mic, MicOff, Radio } from "lucide-react";
import { useState } from "react";
import type { LiveKitSession } from "../../services/livekit/tokenClient";

type LiveAudioConnectionProps = {
  session: LiveKitSession;
  onError: (message: string) => void;
  onDisconnected: () => void;
};

function HostMicControl() {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const [updating, setUpdating] = useState(false);

  async function toggleMicrophone() {
    setUpdating(true);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <button className="live-mic-control" type="button" onClick={toggleMicrophone} disabled={updating}>
      {isMicrophoneEnabled ? <Mic size={17} /> : <MicOff size={17} />}
      {updating ? "Updating microphone" : isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
    </button>
  );
}

export default function LiveAudioConnection({ session, onError, onDisconnected }: LiveAudioConnectionProps) {
  return (
    <LiveKitRoom
      className="livekit-audio-session"
      token={session.token}
      serverUrl={session.serverUrl}
      connect
      audio={session.role === "host"}
      video={false}
      onError={(error) => onError(error.message)}
      onDisconnected={onDisconnected}
    >
      <RoomAudioRenderer />
      <div className="live-audio-status" role="status">
        <Radio size={16} />
        <span>{session.role === "host" ? "You are live as Anonymous Host" : "Listening anonymously"}</span>
        {session.role === "host" && <HostMicControl />}
      </div>
    </LiveKitRoom>
  );
}
