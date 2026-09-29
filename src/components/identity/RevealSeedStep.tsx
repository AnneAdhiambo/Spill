import { useState } from "react";

interface RevealSeedStepProps {
  mnemonic: string;
  onContinue: () => void;
  onBack: () => void;
}

export default function RevealSeedStep({ mnemonic, onContinue, onBack }: RevealSeedStepProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const words = mnemonic.split(" ");

  return (
    <div className="identity-step">
      <p className="eyebrow">Step 1 of 3</p>
      <h1>Save your recovery phrase</h1>
      <p className="identity-subtext">
        These 12 words are the only way to recover your account. Anyone who
        has them can access your identity. Write them down and keep them
        somewhere private and offline — we cannot recover them for you.
      </p>

      <ol className="seed-grid">
        {words.map((word, i) => (
          <li key={i}>
            <span className="seed-index">{i + 1}</span>
            {word}
          </li>
        ))}
      </ol>

      <label className="identity-checkbox">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        I've written down my recovery phrase and stored it somewhere safe
      </label>

      <div className="identity-actions">
        <button className="secondary-button" onClick={onBack}>
          Back
        </button>
        <button className="primary-button" disabled={!acknowledged} onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
