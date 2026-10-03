import { Download, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export default function PwaInstallSticker() {
  const [installable, setInstallable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Also check if app is already running in standalone/installed mode
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstallable(false);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallable(false);
    }
    deferredPrompt = null;
  };

  if (!installable || dismissed) return null;

  return (
    <div className="pwa-install-sticker" role="dialog" aria-label="Install Spill PWA App">
      <div className="pwa-sticker-content">
        <img src="/assets/spill-logo.png" alt="Spill App Icon" className="pwa-sticker-logo" />
        <div className="pwa-sticker-text">
          <div className="pwa-sticker-title">
            <Smartphone size={15} />
            <span>Install Spill App</span>
          </div>
          <p className="pwa-sticker-desc">Add to your mobile home screen for quick access & offline support.</p>
        </div>
      </div>

      <div className="pwa-sticker-actions">
        <button type="button" className="pwa-install-btn" onClick={handleInstallClick}>
          <Download size={15} /> Install App
        </button>
        <button type="button" className="pwa-dismiss-btn" onClick={() => setDismissed(true)} aria-label="Dismiss install prompt">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/** Global trigger to trigger installation from any navbar or button */
export async function triggerPwaInstall(): Promise<boolean> {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === "accepted";
  }
  return false;
}
