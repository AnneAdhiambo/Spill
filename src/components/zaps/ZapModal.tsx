import {
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Zap,
  X,
} from "lucide-react";
import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "../../hooks/useWallet";
import { useBitcoinUsdEstimate } from "../../hooks/useBitcoinUsdEstimate";
import { sendNutzap } from "../../services/nostr/nutzapService";

type SupportMode = "anonymous" | "private";
type ModalView = "support" | "confirm" | "sending" | "complete" | "add-funds" | "add-funds-invoice";

type ZapModalProps = {
  initialSats?: number;
  targetLabel: string;
  recipientNostrPubkey?: string;
  targetEventId?: string;
  onClose: () => void;
};

// Default fallback Nostr pubkey for demo reports if no pubkey is passed
const DEMO_RECIPIENT_PUBKEY = "32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245";

export default function ZapModal({
  initialSats = 21,
  targetLabel,
  recipientNostrPubkey = DEMO_RECIPIENT_PUBKEY,
  targetEventId,
  onClose,
}: ZapModalProps) {
  const wallet = useWallet();
  const [amountInput, setAmountInput] = useState(String(initialSats));
  const [supportMode, setSupportMode] = useState<SupportMode>("anonymous");
  const [memoInput, setMemoInput] = useState("");
  const [passcodeInput, setPasscodeInput] = useState("");
  const [view, setView] = useState<ModalView>("support");

  const [sendingStatus, setSendingStatus] = useState("Preparing Nutzap...");
  const [error, setError] = useState<string | null>(null);
  const [sentAmount, setSentAmount] = useState<number>(0);

  // Add Funds Inline State
  const [invoiceData, setInvoiceData] = useState<{ quoteId: string; invoice: string } | null>(null);

  const sats = useMemo(() => {
    const amount = Number.parseInt(amountInput, 10);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }, [amountInput]);

  const zapUsd = useBitcoinUsdEstimate(sats);

  const hasEnoughBalance = wallet.balance >= sats;

  async function handleSendNutzap(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);

    const activePasscode = passcodeInput || sessionStorage.getItem("spill.wallet.session.passcode");
    if (!activePasscode) {
      setError("Please enter your device passcode to authorize this transaction.");
      return;
    }

    setView("sending");
    setSendingStatus("Reserving proofs & processing payment...");

    try {
      await sendNutzap(
        activePasscode,
        recipientNostrPubkey,
        sats,
        memoInput || undefined,
        targetEventId
      );
      setSentAmount(sats);
      setView("complete");
      wallet.refreshState(activePasscode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send sats.";
      setError(msg);
      setView("confirm");
    }
  }

  async function handleCreateInvoice() {
    try {
      const needed = Math.max(21, sats - wallet.balance);
      const res = await wallet.addFundsQuote(needed);
      setInvoiceData(res);
      setView("add-funds-invoice");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create Lightning invoice.";
      setError(msg);
    }
  }

  return createPortal(
    <div className="zap-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="zap-modal zap-wallet-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zap-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="zap-modal-close" type="button" onClick={onClose} aria-label="Close support options">
          <X size={20} />
        </button>

        {/* SCREEN 1: AMOUNT & SUPPORT OPTIONS */}
        {view === "support" && (
          <div className="zap-send-screen">
            <p className="zap-recipient-label">Supporting</p>
            <h2 id="zap-modal-title">{targetLabel}</h2>

            <label className="zap-wallet-amount">
              <span className="sr-only">Amount in sats</span>
              <input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                type="text"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value.replace(/\D/g, ""))}
              />
              <span>sats</span>
            </label>

            {zapUsd !== null && (
              <p className="zap-usd-estimate">
                ≈ ${zapUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </p>
            )}

            <div className="zap-amount-options" style={{ margin: "16px 0" }}>
              {[10, 21, 50, 100].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={sats === preset ? "is-selected" : ""}
                  onClick={() => setAmountInput(String(preset))}
                >
                  {preset} sats
                </button>
              ))}
            </div>

            <p className="zap-balance-line">
              Wallet balance: <strong>{wallet.isUnlocked ? `${wallet.balance} sats` : "Locked"}</strong>
            </p>

            <div style={{ marginTop: "14px", textAlign: "left" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", display: "block", marginBottom: "4px" }}>
                Memo (optional)
              </label>
              <input
                type="text"
                placeholder="Add a message for the recipient..."
                value={memoInput}
                onChange={(e) => setMemoInput(e.target.value)}
                maxLength={120}
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

            <fieldset className="zap-privacy-options" style={{ marginTop: "16px" }}>
              <legend>Privacy</legend>
              <label className={supportMode === "anonymous" ? "is-selected" : ""}>
                <input
                  checked={supportMode === "anonymous"}
                  name="support-privacy"
                  type="radio"
                  onChange={() => setSupportMode("anonymous")}
                />
                <ShieldCheck size={20} aria-hidden="true" />
                <span>
                  <strong>Send anonymously</strong>
                  <small>100% goes to them. Spill takes no fee.</small>
                </span>
              </label>
              <label className={supportMode === "private" ? "is-selected" : ""}>
                <input
                  checked={supportMode === "private"}
                  name="support-privacy"
                  type="radio"
                  onChange={() => setSupportMode("private")}
                />
                <EyeOff size={20} aria-hidden="true" />
                <span>
                  <strong>Support privately</strong>
                  <small>No public receipt link on user profile.</small>
                </span>
              </label>
            </fieldset>

            {hasEnoughBalance ? (
              <button
                className="zap-create-invoice"
                type="button"
                onClick={() => setView("confirm")}
                disabled={sats === 0}
              >
                Send {sats} sats
              </button>
            ) : (
              <button
                className="zap-create-invoice"
                type="button"
                onClick={handleCreateInvoice}
                style={{ background: "#f97316" }}
              >
                <Plus size={18} /> Add funds ({sats - wallet.balance} sats needed)
              </button>
            )}
          </div>
        )}

        {/* SCREEN 2: CONFIRMATION & PASSCODE */}
        {view === "confirm" && (
          <div className="zap-confirm-screen">
            <button className="zap-inline-back" type="button" onClick={() => setView("support")}>
              <ArrowLeft size={16} /> Back
            </button>
            <span className="zap-modal-kicker">
              <Zap size={15} /> CONFIRM PAYMENT
            </span>
            <h2 id="zap-modal-title">Send {sats} sats?</h2>

            <dl className="zap-review-details">
              <div>
                <dt>To</dt>
                <dd>{targetLabel}</dd>
              </div>
              <div>
                <dt>Fee</dt>
                <dd style={{ color: "#16a34a" }}>100% goes to them. Spill takes no fee.</dd>
              </div>
            </dl>

            <form onSubmit={handleSendNutzap} style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
              {!sessionStorage.getItem("spill.wallet.session.passcode") && (
                <div>
                  <label style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", display: "block", marginBottom: "4px" }}>
                    Device Passcode
                  </label>
                  <input
                    type="password"
                    placeholder="Enter device passcode to authorize"
                    value={passcodeInput}
                    onChange={(e) => setPasscodeInput(e.target.value)}
                    required
                    minLength={8}
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
              )}

              {error && (
                <p className="error-message" role="alert" style={{ textAlign: "center" }}>
                  {error}
                </p>
              )}

              <button className="zap-create-invoice" type="submit">
                <Zap size={18} /> Confirm & Send {sats} sats
              </button>
            </form>
          </div>
        )}

        {/* SCREEN 3: SENDING IN PROGRESS */}
        {view === "sending" && (
          <div className="zap-invoice-preview zap-complete-preview">
            <span className="zap-modal-kicker">
              <RefreshCw size={15} className="animate-spin" /> SENDING SATS
            </span>
            <h2 id="zap-modal-title">Sending {sats} sats…</h2>
            <p>{sendingStatus}</p>
            <div style={{ margin: "24px auto" }}>
              <RefreshCw size={48} className="animate-spin" style={{ color: "#ff7a1a" }} />
            </div>
            <p className="zap-invoice-copy">100% goes to recipient. Spill takes no fee.</p>
          </div>
        )}

        {/* SCREEN 4: COMPLETE SUCCESS */}
        {view === "complete" && (
          <div className="zap-invoice-preview zap-complete-preview">
            <span className="zap-modal-kicker">
              <CheckCircle2 size={15} /> PAYMENT SENT
            </span>
            <h2 id="zap-modal-title">Sent {sentAmount} sats to {targetLabel}!</h2>
            <p>100% goes to them. Spill takes no fee.</p>
            <CheckCircle2 className="zap-complete-icon" size={74} strokeWidth={1.4} aria-hidden="true" />
            <button className="zap-copy-invoice" type="button" onClick={onClose}>
              Done
            </button>
          </div>
        )}

        {/* SCREEN 5: INLINE ADD FUNDS INVOICE */}
        {view === "add-funds-invoice" && invoiceData && (
          <div className="zap-invoice-preview">
            <button className="zap-inline-back" type="button" onClick={() => setView("support")}>
              <ArrowLeft size={16} /> Back to support
            </button>
            <span className="zap-modal-kicker">
              <QrCode size={15} /> ADD FUNDS
            </span>
            <h2 id="zap-modal-title">Fund your wallet</h2>
            <p className="zap-invoice-copy">Scan this invoice with any Lightning wallet to top up your balance.</p>

            <button
              className="zap-create-invoice"
              type="button"
              onClick={() => {
                onClose();
              }}
              style={{ marginTop: "16px" }}
            >
              Open Wallet Modal to complete deposit
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
