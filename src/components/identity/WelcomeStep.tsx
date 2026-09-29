interface WelcomeStepProps {
  onCreateNew: () => void;
  onImport: () => void;
  hasStoredIdentity: boolean;
  onUnlock: () => void;
}

export default function WelcomeStep({
  onCreateNew,
  onImport,
  hasStoredIdentity,
  onUnlock,
}: WelcomeStepProps) {
  return (
    <div className="identity-step">
      <p className="eyebrow">Your identity. Your control.</p>
      <h1>Get started with Spill</h1>
      <p className="identity-subtext">
        Spill runs on Nostr — you hold your own key, not us. Create a new
        identity or bring one you already have.
      </p>

      <div className="identity-actions">
        {hasStoredIdentity && (
          <button className="primary-button" onClick={onUnlock}>
            Unlock my identity
          </button>
        )}
        <button
          className={hasStoredIdentity ? "secondary-button" : "primary-button"}
          onClick={onCreateNew}
        >
          Create a new identity
        </button>
        <button className="secondary-button" onClick={onImport}>
          I already have a key
        </button>
      </div>
    </div>
  );
}
