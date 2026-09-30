import { useState } from "react";
import Navbar from "../components/landing/Navbar";
import WelcomeStep from "../components/identity/WelcomeStep";
import RevealSeedStep from "../components/identity/RevealSeedStep";
import ConfirmSeedStep from "../components/identity/ConfirmSeedStep";
import SetPasscodeStep from "../components/identity/SetPasscodeStep";
import ImportKeyStep from "../components/identity/ImportKeyStep";
import UnlockStep from "../components/identity/UnlockStep";
import DoneStep from "../components/identity/DoneStep";
import {
  createIdentity,
  saveIdentity,
  hasStoredIdentity,
  unlockIdentity,
  type NewIdentity,
} from "../features/identity/keys";

type Step =
  | "welcome"
  | "reveal-seed"
  | "confirm-seed"
  | "set-passcode"
  | "import"
  | "unlock"
  | "done";

export default function GetStartedPage() {
  const [step, setStep] = useState<Step>("welcome");
  const [identity, setIdentity] = useState<NewIdentity | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [finalNpub, setFinalNpub] = useState<string | null>(null);

  function startCreate() {
    setIdentity(createIdentity());
    setStep("reveal-seed");
  }

  function startImport() {
    setStep("import");
  }

  function handleImported(imported: NewIdentity) {
    setIdentity(imported);
    // Imported keys skip seed confirmation (nothing new to lose) and go
    // straight to setting a device passcode.
    setStep("set-passcode");
  }

  async function handleSetPasscode(passcode: string) {
    if (!identity) return;
    setSubmitting(true);
    try {
      await saveIdentity(identity, passcode);
      setFinalNpub(identity.npub);
      setStep("done");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlock(passcode: string) {
    setSubmitting(true);
    setUnlockError(null);
    try {
      const { npub } = await unlockIdentity(passcode);
      setFinalNpub(npub);
      setStep("done");
    } catch (e) {
      setUnlockError(e instanceof Error ? e.message : "Couldn't unlock.");
    } finally {
      setSubmitting(false);
    }
  }

  function finish() {
    window.location.pathname = "/communities";
  }

  return (
    <main className="identity-page">
      <Navbar />
      <section className="identity-shell">
        {step === "welcome" && (
          <WelcomeStep
            hasStoredIdentity={hasStoredIdentity()}
            onCreateNew={startCreate}
            onImport={startImport}
            onUnlock={() => setStep("unlock")}
          />
        )}

        {step === "reveal-seed" && identity && (
          <RevealSeedStep
            mnemonic={identity.mnemonic}
            onContinue={() => setStep("confirm-seed")}
            onBack={() => setStep("welcome")}
          />
        )}

        {step === "confirm-seed" && identity && (
          <ConfirmSeedStep
            mnemonic={identity.mnemonic}
            onConfirmed={() => setStep("set-passcode")}
            onBack={() => setStep("reveal-seed")}
          />
        )}

        {step === "import" && (
          <ImportKeyStep onImported={handleImported} onBack={() => setStep("welcome")} />
        )}

        {step === "set-passcode" && (
          <SetPasscodeStep
            onSubmit={handleSetPasscode}
            onBack={() => setStep(identity?.mnemonic ? "confirm-seed" : "import")}
            submitting={submitting}
          />
        )}

        {step === "unlock" && (
          <UnlockStep
            onSubmit={handleUnlock}
            onBack={() => setStep("welcome")}
            submitting={submitting}
            error={unlockError}
          />
        )}

        {step === "done" && finalNpub && <DoneStep npub={finalNpub} onContinue={finish} />}
      </section>
    </main>
  );
}
