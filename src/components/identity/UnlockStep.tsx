import { useState } from "react";

interface UnlockStepProps {
  onSubmit: (passcode: string) => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}

export default function UnlockStep({ onSubmit, onBack, submitting, error }: UnlockStepProps) {
  const [passcode, setPasscode] = useState("");

  return (
    <div className="identity-step">
      <p className="eyebrow">Welcome back</p>
      <h1>Unlock your identity</h1>
      <p className="identity-subtext">Enter your passcode to continue.</p>

      <div className="identity-form">
        <label>
          Passcode
          <input
            type="password"
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit(passcode)}
          />
        </label>
      </div>

      {error && <p className="identity-error">{error}</p>}

      <div className="identity-actions">
        <button className="secondary-button" onClick={onBack} disabled={submitting}>
          Back
        </button>
        <button className="primary-button" onClick={() => onSubmit(passcode)} disabled={submitting}>
          {submitting ? "Unlocking…" : "Unlock"}
        </button>
      </div>
    </div>
  );
}
