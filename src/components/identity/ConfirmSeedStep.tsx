import { useMemo, useState } from "react";

interface ConfirmSeedStepProps {
  mnemonic: string;
  onConfirmed: () => void;
  onBack: () => void;
}

// Ask for 3 of the 12 words, at random positions, to prove they saved it
// without requiring the whole phrase be retyped.
function pickCheckIndices(count: number): number[] {
  const indices = new Set<number>();
  while (indices.size < 3) indices.add(Math.floor(Math.random() * count));
  return Array.from(indices).sort((a, b) => a - b);
}

export default function ConfirmSeedStep({ mnemonic, onConfirmed, onBack }: ConfirmSeedStepProps) {
  const words = useMemo(() => mnemonic.split(" "), [mnemonic]);
  const checkIndices = useMemo(() => pickCheckIndices(words.length), [words.length]);
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const allMatch = checkIndices.every(
      (i) => (inputs[i] ?? "").trim().toLowerCase() === words[i]
    );
    if (!allMatch) {
      setError("That doesn't match. Check your saved phrase and try again.");
      return;
    }
    setError(null);
    onConfirmed();
  }

  return (
    <div className="identity-step">
      <p className="eyebrow">Step 2 of 3</p>
      <h1>Confirm your recovery phrase</h1>
      <p className="identity-subtext">Enter the requested words to confirm you saved them.</p>

      <div className="seed-confirm-grid">
        {checkIndices.map((i) => (
          <label key={i}>
            Word #{i + 1}
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={inputs[i] ?? ""}
              onChange={(e) => setInputs({ ...inputs, [i]: e.target.value })}
            />
          </label>
        ))}
      </div>

      {error && <p className="identity-error">{error}</p>}

      <div className="identity-actions">
        <button className="secondary-button" onClick={onBack}>
          Back
        </button>
        <button className="primary-button" onClick={handleSubmit}>
          Confirm
        </button>
      </div>
    </div>
  );
}
