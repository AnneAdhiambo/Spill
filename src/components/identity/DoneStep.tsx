interface DoneStepProps {
  npub: string;
  onContinue: () => void;
}

export default function DoneStep({ npub, onContinue }: DoneStepProps) {
  const short = `${npub.slice(0, 12)}…${npub.slice(-6)}`;

  return (
    <div className="identity-step">
      <p className="eyebrow">You're set</p>
      <h1>Welcome to Spill</h1>
      <p className="identity-subtext">
        Your identity is ready and secured on this device.
      </p>
      <p className="identity-npub">{short}</p>

      <div className="identity-actions">
        <button className="primary-button" onClick={onContinue}>
          Continue to Spill
        </button>
      </div>
    </div>
  );
}
