import { Radio, ShieldCheck, UsersRound } from "lucide-react";
import type { SpaceDraft } from "../../types/spaces";

type NewSpaceCardProps = {
  space: SpaceDraft;
};

export default function NewSpaceCard({ space }: NewSpaceCardProps) {
  return (
    <section className="new-space-card" aria-label="Newly created Space">
      <span className="live-badge"><span className="dot" /> YOUR SPACE IS LIVE</span>
      <h2>{space.title}</h2>
      <p>{space.prompt}</p>
      <div className="new-space-details">
        <span><Radio size={17} /> {space.topic}</span>
        <span><ShieldCheck size={17} /> Protected identities</span>
        <span><UsersRound size={17} /> Waiting for listeners</span>
      </div>
    </section>
  );
}
