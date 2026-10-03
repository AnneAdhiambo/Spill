import { EyeOff } from "lucide-react";
import { useState } from "react";
import type { SensitiveReason } from "../../data/communityReports";

type SensitiveMediaProps = {
  src: string;
  alt: string;
  reason: SensitiveReason;
};

export default function SensitiveMedia({ src, alt, reason }: SensitiveMediaProps) {
  const [isRevealed, setIsRevealed] = useState(false);

  return (
    <div className={`sensitive-media${isRevealed ? " is-revealed" : ""}`}>
      <img src={src} alt={isRevealed ? alt : "Sensitive media is concealed"} />
      {!isRevealed && (
        <div className="sensitive-overlay">
          <EyeOff size={32} aria-hidden="true" />
          <h3>Sensitive content</h3>
          <p>This image may be distressing because it contains content related to {reason}.</p>
          <button type="button" onClick={() => setIsRevealed(true)}>
            Reveal image
          </button>
        </div>
      )}
    </div>
  );
}
