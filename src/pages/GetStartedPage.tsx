import { useState } from "react";
import { Copy, Download, Eye, EyeOff } from "lucide-react";
import {
  beginIdentitySession,
  clearStoredIdentity,
  createIdentity,
  getStoredNpub,
  importIdentity,
  saveIdentity,
  type Identity,
} from "../features/identity/keys";
import { publishProfile } from "../services/nostr/identityService";
import { publishNutzapConfiguration } from "../services/nostr/nutzapService";

type Step = "welcome" | "save" | "import" | "done";
type RelayStatus = "none" | "pending" | "ok" | "failed";

export default function GetStartedPage() {
  const [step, setStep] = useState<Step>("welcome");
  const [storedNpub, setStoredNpub] = useState<string | null>(getStoredNpub());
  const [draft, setDraft] = useState<Identity | null>(null);
  const [npub, setNpub] = useState("");
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("none");

  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [error, setError] = useState("");

  function startCreate() {
    setDraft(createIdentity());
    setRevealed(false);
    setCopied(false);
    setStep("save");
  }

  function downloadKey() {
    if (!draft) return;
    const text = `Spill / Nostr key\n\nPublic key (npub): ${draft.npub}\nPrivate key (nsec): ${draft.nsec}\n\nKeep this file safe. Anyone with the nsec controls the account.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "spill-private-key.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyKey() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.nsec);
      setCopied(true);
    } catch {
      setError("Could not copy. Use the download button instead.");
    }
  }

  function finishCreate() {
    if (!draft) return;
    downloadKey();
    saveIdentity(draft);
    beginIdentitySession();
    setNpub(draft.npub);
    setStoredNpub(draft.npub);

    setRelayStatus("pending");
    publishProfile(draft.privateKeyHex).then((ok) => setRelayStatus(ok ? "ok" : "failed"));
    publishNutzapConfiguration().catch(() => undefined);

    setStep("done");
  }

  function handleImport() {
    setError("");
    try {
      const identity = importIdentity(importValue);
      saveIdentity(identity);
      beginIdentitySession();
      setNpub(identity.npub);
      setStoredNpub(identity.npub);
      publishNutzapConfiguration().catch(() => undefined);
      setImportValue("");
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that key.");
    }
  }

  function continueAsStored() {
    if (!storedNpub) return;
    beginIdentitySession();
    setNpub(storedNpub);
    setStep("done");
  }

  function forgetDevice() {
    if (window.confirm("Remove the saved key from this device? You will need your nsec to sign in again.")) {
      clearStoredIdentity();
      setStoredNpub(null);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <a className="auth-brand" href="/" aria-label="Spill home">
          <img src="/assets/spill-logo.png" alt="Spill" />
        </a>

        {step === "welcome" && (
          <>
            <h1>Welcome to Spill</h1>
            <p className="auth-sub">Your identity is a Nostr key. It stays on your device.</p>

            {storedNpub && (
              <>
                <button className="primary-button auth-wide" type="button" onClick={continueAsStored}>
                  Continue as {storedNpub.slice(0, 10)}…{storedNpub.slice(-4)}
                </button>
                <div className="auth-divider">or</div>
              </>
            )}

            <button
              className={storedNpub ? "secondary-button auth-wide" : "primary-button auth-wide"}
              type="button"
              onClick={startCreate}
            >
              Create a new identity
            </button>
            <button
              className="secondary-button auth-wide"
              type="button"
              onClick={() => {
                setError("");
                setStep("import");
              }}
            >
              I already have a key
            </button>

            {storedNpub && (
              <button className="auth-link" type="button" onClick={forgetDevice}>
                Remove saved key from this device
              </button>
            )}
          </>
        )}

        {step === "save" && draft && (
          <>
            <h1>Save your private key</h1>
            <div className="auth-key-field">
              <input
                type={revealed ? "text" : "password"}
                value={draft.nsec}
                readOnly
                aria-label="Your private key (nsec)"
              />
              <button
                className="auth-icon-button"
                type="button"
                onClick={() => setRevealed(!revealed)}
                aria-label={revealed ? "Hide key" : "Show key"}
              >
                {revealed ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              <button className="auth-icon-button" type="button" onClick={copyKey} aria-label="Copy key">
                <Copy size={18} />
              </button>
            </div>
            {copied && <p className="auth-sub">Copied.</p>}
            <p className="auth-warning">
              This key is your only way to access your account. If you lose it, you lose the account.
            </p>
            <button className="primary-button auth-wide" type="button" onClick={finishCreate}>
              <Download size={16} aria-hidden="true" /> Download &amp; continue
            </button>
            <button className="auth-link" type="button" onClick={() => setStep("welcome")}>
              Back
            </button>
            {error && <p className="auth-error">{error}</p>}
          </>
        )}

        {step === "import" && (
          <>
            <h1>Sign in with your key</h1>
            <p className="auth-sub">Paste your private key (starts with nsec1).</p>
            <div className="auth-key-field">
              <input
                type="password"
                value={importValue}
                onChange={(e) => setImportValue(e.target.value)}
                placeholder="nsec1..."
                autoComplete="off"
                spellCheck={false}
                aria-label="Private key (nsec)"
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button
              className="primary-button auth-wide"
              type="button"
              onClick={handleImport}
              disabled={!importValue.trim()}
            >
              Sign in
            </button>
            <button className="auth-link" type="button" onClick={() => setStep("welcome")}>
              Back
            </button>
          </>
        )}

        {step === "done" && (
          <>
            <h1>You're in</h1>
            <p className="auth-sub">Your public key (npub):</p>
            <p className="auth-npub">{npub}</p>
            {relayStatus === "pending" && <p className="auth-sub">Publishing your profile to Nostr relays…</p>}
            {relayStatus === "ok" && <p className="auth-ok">Connected: profile published to Nostr relays.</p>}
            {relayStatus === "failed" && (
              <p className="auth-warning">
                Couldn't reach a Nostr relay right now. Your key works and is saved on this device.
              </p>
            )}
            <button
              className="primary-button auth-wide"
              type="button"
              onClick={() => {
                window.location.pathname = "/communities";
              }}
            >
              Continue to Spill
            </button>
          </>
        )}
      </div>
    </main>
  );
}
