import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Copy,
  EyeOff,
  QrCode,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useBitcoinUsdEstimate } from "../../hooks/useBitcoinUsdEstimate";
import { usePrivateCreditsDemo } from "../../hooks/usePrivateCreditsDemo";

type SupportMode = "anonymous" | "private";
type PaymentMethod = "credits" | "wallet";
type ModalView = "support" | "confirm" | "wallet-invoice" | "credit-complete" | "credits-needed";

type ZapModalProps = {
  initialSats?: number;
  targetLabel: string;
  onClose: () => void;
};

function formatUsd(estimate: number | null) {
  if (estimate === null) return "USD estimate unavailable";
  return `~ ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(estimate)} USD`;
}

export default function ZapModal({ initialSats = 21, targetLabel, onClose }: ZapModalProps) {
  const [amountInput, setAmountInput] = useState(String(initialSats));
  const [supportMode, setSupportMode] = useState<SupportMode>("anonymous");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("credits");
  const [view, setView] = useState<ModalView>("support");
  const { balance, spendTestCredits } = usePrivateCreditsDemo();

  const sats = useMemo(() => {
    const amount = Number.parseInt(amountInput, 10);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }, [amountInput]);
  const usdEstimate = useBitcoinUsdEstimate(sats);

  function confirmSupport() {
    if (paymentMethod === "wallet") {
      setView("wallet-invoice");
      return;
    }

    if (balance < sats) {
      setView("credits-needed");
      return;
    }

    spendTestCredits(sats);
    setView("credit-complete");
  }

  return (
    <div className="zap-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="zap-modal zap-wallet-modal" role="dialog" aria-modal="true" aria-labelledby="zap-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="zap-modal-close" type="button" onClick={onClose} aria-label="Close support options"><X size={20} /></button>

        {view === "support" && (
          <div className="zap-send-screen">
            <p className="zap-recipient-label">Supporting</p>
            <h2 id="zap-modal-title">{targetLabel}</h2>
            <label className="zap-wallet-amount">
              <span className="sr-only">Amount in sats</span>
              <input autoFocus inputMode="numeric" pattern="[0-9]*" type="text" value={amountInput} onChange={(event) => setAmountInput(event.target.value.replace(/\D/g, ""))} />
              <span>sats</span>
            </label>
            <p className="zap-usd-estimate">{formatUsd(usdEstimate)}</p>
            <p className="zap-balance-line">Private Credits balance: <strong>{balance} test sats</strong></p>

            <fieldset className="zap-source-options">
              <legend>Pay from</legend>
              <button className={paymentMethod === "credits" ? "is-selected" : ""} type="button" onClick={() => setPaymentMethod("credits")}>
                <Coins size={20} /><span><strong>Private Credits</strong><small>Private, device-held test balance.</small></span>
              </button>
              <button className={paymentMethod === "wallet" ? "is-selected" : ""} type="button" onClick={() => setPaymentMethod("wallet")}>
                <WalletCards size={20} /><span><strong>Lightning wallet</strong><small>Scan an invoice or open your own wallet.</small></span>
              </button>
            </fieldset>
            <button className="zap-create-invoice" type="button" onClick={() => setView("confirm")} disabled={sats === 0}>Continue</button>
          </div>
        )}

        {view === "confirm" && (
          <div className="zap-confirm-screen">
            <button className="zap-inline-back" type="button" onClick={() => setView("support")}><ArrowLeft size={16} /> Back</button>
            <span className="zap-modal-kicker"><ShieldCheck size={15} /> REVIEW SUPPORT</span>
            <h2 id="zap-modal-title">Send {sats} sats?</h2>
            <p className="zap-usd-estimate">{formatUsd(usdEstimate)}</p>
            <dl className="zap-review-details"><div><dt>To</dt><dd>{targetLabel}</dd></div><div><dt>From</dt><dd>{paymentMethod === "credits" ? "Private Credits" : "Lightning wallet"}</dd></div></dl>
            <fieldset className="zap-privacy-options">
              <legend>Privacy</legend>
              <label className={supportMode === "anonymous" ? "is-selected" : ""}>
                <input checked={supportMode === "anonymous"} name="support-privacy" type="radio" onChange={() => setSupportMode("anonymous")} />
                <ShieldCheck size={20} aria-hidden="true" />
                <span><strong>Zap anonymously</strong><small>Use a one-time identity. Your Spill profile is not linked.</small></span>
              </label>
              <label className={supportMode === "private" ? "is-selected" : ""}>
                <input checked={supportMode === "private"} name="support-privacy" type="radio" onChange={() => setSupportMode("private")} />
                <EyeOff size={20} aria-hidden="true" />
                <span><strong>Support privately</strong><small>No public zap receipt is shown on the report.</small></span>
              </label>
            </fieldset>
            <p className="zap-modal-note">{paymentMethod === "credits" ? "Test credits only. No Cashu token or real payment will be sent." : "Invoice preview only. No wallet payment will be sent."}</p>
            <button className="zap-create-invoice" type="button" onClick={confirmSupport}>{paymentMethod === "credits" ? "Confirm test support" : "Create Lightning invoice"}</button>
          </div>
        )}

        {view === "wallet-invoice" && (
          <div className="zap-invoice-preview">
            <button className="zap-inline-back" type="button" onClick={() => setView("confirm")}><ArrowLeft size={16} /> Back</button>
            <span className="zap-modal-kicker"><QrCode size={15} /> LIGHTNING INVOICE</span>
            <h2 id="zap-modal-title">Ready for your wallet</h2>
            <p>{sats} sats for {targetLabel}</p>
            <div className="zap-qr-placeholder" role="img" aria-label="Lightning invoice QR code placeholder"><QrCode size={74} strokeWidth={1.5} /></div>
            <p className="zap-invoice-copy">This is an invoice preview. Real invoices will appear after the report is published to Nostr and has a Lightning receiving address.</p>
            <button className="zap-copy-invoice" type="button" disabled><Copy size={17} /> Invoice available after setup</button>
          </div>
        )}

        {view === "credits-needed" && (
          <div className="zap-invoice-preview zap-complete-preview">
            <span className="zap-modal-kicker"><Coins size={15} /> PRIVATE CREDITS</span>
            <h2 id="zap-modal-title">Private Credits unavailable</h2>
            <p>You have {balance} test sats, but this support needs {sats} sats.</p>
            <p className="zap-invoice-copy">Add credits from your Private Credits wallet, then return to support this reporter.</p>
            <button className="zap-copy-invoice" type="button" onClick={() => { setPaymentMethod("wallet"); setView("confirm"); }}>Use a Lightning wallet instead</button>
            <button className="zap-back-button" type="button" onClick={() => setView("support")}>Change support amount</button>
          </div>
        )}

        {view === "credit-complete" && (
          <div className="zap-invoice-preview zap-complete-preview">
            <span className="zap-modal-kicker"><CheckCircle2 size={15} /> TEST COMPLETE</span>
            <h2 id="zap-modal-title">Support workflow complete</h2>
            <p>{sats} test credits were used to support {targetLabel}.</p>
            <CheckCircle2 className="zap-complete-icon" size={74} strokeWidth={1.4} aria-hidden="true" />
            <p className="zap-invoice-copy">No Cashu token or real payment was sent. This confirms the interaction flow only.</p>
            <button className="zap-copy-invoice" type="button" onClick={onClose}>Done</button>
          </div>
        )}
      </section>
    </div>
  );
}
