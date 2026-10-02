import { useState } from "react";
import { nip19 } from "nostr-tools";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { importIdentity, type NewIdentity } from "../../features/identity/keys";

interface ImportKeyStepProps {
  onImported: (identity: NewIdentity) => void;
  onBack: () => void;
}

export default function ImportKeyStep({ onImported, onBack }: ImportKeyStepProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const trimmed = value.trim();
    try {
      if (trimmed.startsWith("nsec1")) {
        const decoded = nip19.decode(trimmed);
        if (decoded.type !== "nsec") throw new Error("Not a valid nsec key.");
        // An imported nsec has no mnemonic behind it in this flow.
        const sk = decoded.data as Uint8Array;
        const privateKeyHex = Array.from(sk)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const nutzapSecretKey = generateSecretKey();
        onImported({
          mnemonic: "",
          privateKeyHex,
          npub: nip19.npubEncode(getPublicKey(sk)),
          nsec: trimmed,
          nutzapPrivateKeyHex: Array.from(nutzapSecretKey).map((b) => b.toString(16).padStart(2, "0")).join(""),
          nutzapPubkey: getPublicKey(nutzapSecretKey),
        });
        return;
      }
      // Otherwise treat it as a 12-word recovery phrase.
      const identity = importIdentity(trimmed);
      onImported(identity);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that key.");
    }
  }

  return (
    <div className="identity-step">
      <p className="eyebrow">Import an existing key</p>
      <h1>Bring your identity</h1>
      <p className="identity-subtext">
        Paste your 12-word recovery phrase or your nsec private key. This
        stays on your device and is never sent anywhere.
      </p>

      <textarea
        className="identity-textarea"
        rows={3}
        placeholder="word1 word2 word3 …  or  nsec1…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
      />

      {error && <p className="identity-error">{error}</p>}

      <div className="identity-actions">
        <button className="secondary-button" onClick={onBack}>
          Back
        </button>
        <button className="primary-button" onClick={handleSubmit}>
          Continue
        </button>
      </div>
    </div>
  );
}
