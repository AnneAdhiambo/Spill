import { AudioLines, Feather, Radio, Sparkles, Waves } from "lucide-react";

const speakers = [
  { icon: Waves, tone: "blue" },
  { icon: Feather, tone: "green" },
  { icon: Sparkles, tone: "purple" },
  { icon: Radio, tone: "orange" },
];

type RoomParticipantsProps = {
  embedded?: boolean;
};

export default function RoomParticipants({ embedded = false }: RoomParticipantsProps) {
  return (
    <section className={`participants-card${embedded ? " embedded" : ""}`}>
      <div className="participants-heading">
        <h2>In this room (anonymous)</h2>
        <p>People speak with protected identities. No real names or faces are shown.</p>
      </div>

      <div className="participants-inner">
        <div className="host-column">
          <span className="participant-label">Host</span>
          <div className="host-row">
            <div className="participant-icon host-icon"><AudioLines size={25} /></div>
            <div>
              <strong>Anonymous Host</strong>
              <span className="host-chip">HOST</span>
            </div>
          </div>
        </div>

        <div className="speakers-column">
          <span className="participant-label">Speakers (4)</span>
          <div className="speaker-list">
            {speakers.map(({ icon: Icon, tone }, index) => (
              <div className="speaker-item" key={`${tone}-${index}`}>
                <div className={`participant-icon tone-${tone}`}><Icon size={24} /></div>
                <strong>Anonymous</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
