import { useState } from "react";

interface SetPasscodeStepProps {
  onSubmit: (passcode: string) => void;
  onBack: () => void;
  submitting: boolean;
}

const MIN_LENGTH = 8;

export default function SetPasscodeStep({ onSubmit, onBack, submitting }: SetPasscodeStepProps) {
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (passcode.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (passcode !== confirm) {
      setError("Passcodes don't match.");
      return;
    }
    setError(null);
    onSubmit(passcode);
  }

  return (
    <div className="identity-step">
      <p className="eyebrow">Step 3 of 3</p>
      <h1>Set a passcode</h1>
      <p className="identity-subtext">
        This encrypts your key on this device. It's separate from your
        recovery phrase — if you forget it, your recovery phrase is the only
        way back in.
      </p>

      <div className="identity-form">
        <label>
          Passcode
          <input
            type="password"
            autoComplete="new-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
        </label>
        <label>
          Confirm passcode
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="identity-error">{error}</p>}

      <div className="identity-actions">
        <button className="secondary-button" onClick={onBack} disabled={submitting}>
          Back
        </button>
        <button className="primary-button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Securing your identity…" : "Finish"}
        </button>
      </div>
    </div>
  );
}
