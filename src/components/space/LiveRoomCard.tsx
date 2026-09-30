import { Headphones, LockKeyhole, Mic2, MoreHorizontal, Play, Tag, UsersRound, Zap } from "lucide-react";
import { useState } from "react";
import RoomParticipants from "./RoomParticipants";
import Waveform from "./Waveform";

type LiveRoomCardProps = {
  isJoining: boolean;
  isListening: boolean;
  onListen: () => void;
};

export default function LiveRoomCard({ isJoining, isListening, onListen }: LiveRoomCardProps) {
  const [requested, setRequested] = useState(false);
  const [zapped, setZapped] = useState(false);

  return (
    <article className="live-room-card">
      <div className="live-room-primary">
        <div className="live-room-art-wrap">
          <img src="/assets/live-room-art.png" alt="Activism and civic rights Spill Space room" />
        </div>

        <div className="live-room-content">
          <div className="live-room-topline">
            <span className="live-badge"><span className="dot" /> LIVE</span>
            <button className="icon-ghost" type="button" aria-label="More options"><MoreHorizontal size={20} /></button>
          </div>

          <h2>Activism &amp; Civic Rights</h2>
          <p className="room-question">What happened during today&apos;s demonstrations?</p>

          <div className="room-stats">
            <span><UsersRound size={18} /> 326 listening</span>
            <span><Mic2 size={18} /> 4 speakers</span>
            <span className="protected-pill"><LockKeyhole size={16} /> Protected identities allowed</span>
          </div>

          <div className="room-tags">
            <span className="tag-red"><UsersRound size={16} /> Activism</span>
            <span><Tag size={16} /> Current Events</span>
          </div>

          <div className="wave-row">
            <Waveform />
            <div className="live-timer"><span /> LIVE <time>00:24:17</time></div>
          </div>

          <div className="room-actions">
            <button className={`listen-button ${isListening ? "listening" : ""}`} type="button" onClick={onListen} disabled={isJoining || isListening}>
              {isListening ? <Headphones size={22} /> : <Play size={22} fill="currentColor" />}
              {isJoining ? "Joining…" : isListening ? "Listening" : "Listen Live"}
            </button>
            <button className={`speak-button ${requested ? "requested" : ""}`} type="button" onClick={() => setRequested((value) => !value)}>
              <Mic2 size={21} /> {requested ? "Request Sent" : "Request to Speak"}
            </button>
            <button className={`zap-button ${zapped ? "zapped" : ""}`} type="button" onClick={() => setZapped(true)}>
              <Zap size={20} fill="currentColor" /> {zapped ? "Zapped 21 sats" : "Zap Host"}
            </button>
          </div>
        </div>
      </div>

      <RoomParticipants embedded />
    </article>
  );
}
