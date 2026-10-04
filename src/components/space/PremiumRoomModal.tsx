import { Lock, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useWallet } from "../../hooks/useWallet";
import { payForPremiumRoomAccess } from "../../services/cashu/premiumRoomService";

type PremiumRoomModalProps = {
  roomName: string;
  roomTitle: string;
  priceSats?: number;
  durationDays?: number;
  onSuccess: () => void;
  onClose: () => void;
};

export default function PremiumRoomModal({
  roomName,
  roomTitle,
  priceSats = 50,
  durationDays = 30,
  onSuccess,
  onClose,
}: PremiumRoomModalProps) {
  const wallet = useWallet();
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEnoughBalance = wallet.balance >= priceSats;

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) {
      setError("Please enter your device passcode to authorize payment.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await payForPremiumRoomAccess(passcode, roomName, priceSats);
      wallet.refreshState(passcode);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process premium payment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="zap-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="zap-modal zap-wallet-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: "440px" }}
      >
        <button className="zap-modal-close" type="button" onClick={onClose} aria-label="Close premium room modal">
          <X size={20} />
        </button>

        <div className="zap-send-screen">
          <span className="zap-modal-kicker" style={{ color: "#f59e0b" }}>
            <Sparkles size={15} /> PREMIUM AUDIO SPACE
          </span>
          <h2 id="premium-modal-title" style={{ margin: "6px 0 12px", fontSize: "22px" }}>
            Unlock {roomTitle || roomName}
          </h2>

          <div
            style={{
              padding: "16px",
              borderRadius: "14px",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(255, 122, 26, 0.05))",
              margin: "14px 0",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "13px", color: "var(--muted)", fontWeight: 700 }}>Access Duration</span>
              <strong style={{ fontSize: "14px", color: "var(--text)" }}>{durationDays} Days Unlimited</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "8px" }}>
              <span style={{ fontSize: "13px", color: "var(--muted)", fontWeight: 700 }}>Unlock Fee</span>
              <strong style={{ fontSize: "20px", color: "#f59e0b", fontWeight: 800 }}>{priceSats} sats</strong>
            </div>
          </div>

          <p className="zap-balance-line" style={{ textAlign: "left", marginBottom: "16px" }}>
            Wallet Balance: <strong>{wallet.isUnlocked ? `${wallet.balance} sats` : "Locked"}</strong>
          </p>

          {!hasEnoughBalance ? (
            <div style={{ textAlign: "center" }}>
              <p className="error-message" style={{ marginBottom: "12px" }}>
                You need {priceSats - wallet.balance} more sats to unlock this space.
              </p>
              <button
                type="button"
                className="zap-create-invoice"
                style={{ background: "#f97316" }}
                onClick={async () => {
                  try {
                    await wallet.addFundsQuote(Math.max(21, priceSats - wallet.balance));
                    alert("Lightning invoice generated in Wallet modal. Top up your balance to continue.");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to create invoice.");
                  }
                }}
              >
                <Plus size={18} /> Add Funds
              </button>
            </div>
          ) : (
            <form onSubmit={handlePay} style={{ display: "grid", gap: "12px", textAlign: "left" }}>
              <div>
                <label style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", display: "block", marginBottom: "4px" }}>
                  Device Passcode
                </label>
                <input
                  type="password"
                  placeholder="Enter device passcode to authorize"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  required
                  minLength={8}
                  disabled={loading}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid var(--line)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "14px",
                  }}
                />
              </div>

              {error && (
                <p className="error-message" role="alert" style={{ textAlign: "center", margin: 0 }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="zap-create-invoice"
                disabled={loading || !passcode}
                style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" /> Unlocking Room...
                  </>
                ) : (
                  <>
                    <Lock size={18} /> Pay {priceSats} sats & Unlock Room
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
