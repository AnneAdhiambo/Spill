import {
  ArrowLeft,
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
import { useCashuTestWallet } from "../../hooks/useCashuTestWallet";
import type { CashuTopUpQuote } from "../../services/cashu/testWallet";

type SupportMode = "anonymous" | "private";
type PaymentMethod = "credits" | "wallet";
type ModalView = "support" | "confirm" | "wallet-invoice" | "credits-needed" | "credits-wallet" | "receive-credits" | "top-up-credits" | "top-up-invoice";

type ZapModalProps = {
  initialSats?: number;
  targetLabel: string;
  onClose: () => void;
};

function formatUsd(estimate: number | null) {
  if (estimate === null) return "USD estimate unavailable";
  return `~ ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(estimate)} USD`;
}

function mintName(mintUrl: string) {
  try {
    return new URL(mintUrl).hostname;
  } catch {
    return mintUrl;
  }
}

export default function ZapModal({ initialSats = 21, targetLabel, onClose }: ZapModalProps) {
  const [amountInput, setAmountInput] = useState(String(initialSats));
  const [supportMode, setSupportMode] = useState<SupportMode>("anonymous");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("credits");
  const [view, setView] = useState<ModalView>("support");
  const [tokenInput, setTokenInput] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("100");
  const [topUpQuote, setTopUpQuote] = useState<CashuTopUpQuote | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const wallet = useCashuTestWallet();

  const sats = useMemo(() => {
    const amount = Number.parseInt(amountInput, 10);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }, [amountInput]);
  const usdEstimate = useBitcoinUsdEstimate(sats);
  const activeError = wallet.error ?? notice;

  function openCreditsWallet() {
    setNotice(null);
    setView("credits-wallet");
  }

  async function receiveCredits() {
    const received = await wallet.receiveToken(tokenInput);
    if (received) {
      setTokenInput("");
      setNotice("Private Credits received successfully.");
      setView("credits-wallet");
    }
  }

  async function createTopUpInvoice() {
    const amount = Number.parseInt(topUpAmount, 10);
    const quote = await wallet.createTopUpQuote(amount);
    if (quote) {
      setTopUpQuote(quote);
      setNotice(null);
      setView("top-up-invoice");
    }
  }

  async function checkTopUpInvoice() {
    if (!topUpQuote) return;
    const paid = await wallet.claimTopUpQuote(topUpQuote);
    setNotice(paid ? "Private Credits added to your wallet." : "This test-mint invoice has not been paid yet.");
    if (paid) setView("credits-wallet");
  }

  function continueSupport() {
    if (paymentMethod === "credits" && wallet.balance < sats) {
      setView("credits-needed");
      return;
    }
    setView("confirm");
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
            <button className="zap-balance-line zap-balance-button" type="button" onClick={openCreditsWallet}>Private Credits balance: <strong>{wallet.balance} test sats</strong></button>

            <fieldset className="zap-source-options">
              <legend>Pay from</legend>
              <button className={paymentMethod === "credits" ? "is-selected" : ""} type="button" onClick={() => setPaymentMethod("credits")}>
                <Coins size={20} /><span><strong>Private Credits</strong><small>Cashu test ecash held in this browser.</small></span>
              </button>
              <button className={paymentMethod === "wallet" ? "is-selected" : ""} type="button" onClick={() => setPaymentMethod("wallet")}>
                <WalletCards size={20} /><span><strong>Lightning wallet</strong><small>Scan an invoice or open your own wallet.</small></span>
              </button>
            </fieldset>
            <button className="zap-create-invoice" type="button" onClick={continueSupport} disabled={sats === 0}>Continue</button>
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
            <p className="zap-modal-note">{paymentMethod === "credits" ? "Cashu test wallet connected. Sending to a reporter will be added once reporters can receive Cashu tokens." : "Invoice preview only. No wallet payment will be sent."}</p>
            <button className="zap-create-invoice" type="button" onClick={() => setView("wallet-invoice")}>{paymentMethod === "credits" ? "Continue with Cashu setup" : "Create Lightning invoice"}</button>
          </div>
        )}

        {view === "wallet-invoice" && (
          <div className="zap-invoice-preview">
            <button className="zap-inline-back" type="button" onClick={() => setView("confirm")}><ArrowLeft size={16} /> Back</button>
            <span className="zap-modal-kicker"><QrCode size={15} /> SUPPORT SETUP</span>
            <h2 id="zap-modal-title">Recipient setup needed</h2>
            <p>Spill can now hold Cashu test credits. The reporter still needs a Cashu receiving address before a private support token can be delivered.</p>
            <button className="zap-copy-invoice" type="button" onClick={openCreditsWallet}><Coins size={17} /> Manage Private Credits</button>
          </div>
        )}

        {view === "credits-needed" && (
          <div className="zap-invoice-preview zap-complete-preview">
            <span className="zap-modal-kicker"><Coins size={15} /> PRIVATE CREDITS</span>
            <h2 id="zap-modal-title">Add Private Credits</h2>
            <p>You have {wallet.balance} test sats, but this support needs {sats} sats.</p>
            <p className="zap-invoice-copy">Receive a Cashu test token or create a test-mint Lightning invoice.</p>
            <button className="zap-copy-invoice" type="button" onClick={openCreditsWallet}>Open Private Credits wallet</button>
            <button className="zap-back-button" type="button" onClick={() => { setPaymentMethod("wallet"); setView("support"); }}>Use a Lightning wallet instead</button>
          </div>
        )}

        {view === "credits-wallet" && (
          <div className="zap-credits-wallet">
            <button className="zap-inline-back" type="button" onClick={() => setView("support")}><ArrowLeft size={16} /> Back to support</button>
            <span className="zap-modal-kicker"><Coins size={15} /> PRIVATE CREDITS</span>
            <h2 id="zap-modal-title">Your Private Credits</h2>
            <p className="zap-modal-target">Cashu test wallet on {mintName(wallet.mintUrl)}</p>
            <div className="credits-balance-card"><strong>{wallet.balance}</strong><span>test sats</span></div>
            {notice && <p className="zap-success-message">{notice}</p>}
            {activeError && <p className="zap-error-message">{activeError}</p>}
            <div className="credits-wallet-actions">
              <button type="button" onClick={() => { setNotice(null); setView("receive-credits"); }}><QrCode size={20} /><span><strong>Receive Cashu token</strong><small>Paste a token from this test mint.</small></span></button>
              <button type="button" onClick={() => { setNotice(null); setView("top-up-credits"); }}><WalletCards size={20} /><span><strong>Top up with Lightning</strong><small>Create a test-mint invoice.</small></span></button>
            </div>
          </div>
        )}

        {view === "receive-credits" && (
          <div className="zap-credits-wallet">
            <button className="zap-inline-back" type="button" onClick={openCreditsWallet}><ArrowLeft size={16} /> Back</button>
            <span className="zap-modal-kicker"><QrCode size={15} /> RECEIVE</span>
            <h2 id="zap-modal-title">Receive Private Credits</h2>
            <p className="zap-modal-target">Paste a Cashu token from {mintName(wallet.mintUrl)}.</p>
            <textarea className="cashu-token-input" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} placeholder="cashuB..." autoFocus />
            {activeError && <p className="zap-error-message">{activeError}</p>}
            <button className="zap-create-invoice" type="button" onClick={receiveCredits} disabled={!tokenInput.trim() || wallet.isWorking}>{wallet.isWorking ? "Receiving..." : "Receive credits"}</button>
          </div>
        )}

        {view === "top-up-credits" && (
          <div className="zap-credits-wallet">
            <button className="zap-inline-back" type="button" onClick={openCreditsWallet}><ArrowLeft size={16} /> Back</button>
            <span className="zap-modal-kicker"><WalletCards size={15} /> TOP UP</span>
            <h2 id="zap-modal-title">Create test-mint invoice</h2>
            <p className="zap-modal-target">This uses no-value test ecash.</p>
            <label className="credits-amount-input"><span>Amount</span><input inputMode="numeric" value={topUpAmount} onChange={(event) => setTopUpAmount(event.target.value.replace(/\D/g, ""))} /><b>sats</b></label>
            {activeError && <p className="zap-error-message">{activeError}</p>}
            <button className="zap-create-invoice" type="button" onClick={createTopUpInvoice} disabled={wallet.isWorking}>{wallet.isWorking ? "Creating..." : "Create invoice"}</button>
          </div>
        )}

        {view === "top-up-invoice" && topUpQuote && (
          <div className="zap-invoice-preview">
            <button className="zap-inline-back" type="button" onClick={() => setView("top-up-credits")}><ArrowLeft size={16} /> Back</button>
            <span className="zap-modal-kicker"><QrCode size={15} /> TEST-MINT INVOICE</span>
            <h2 id="zap-modal-title">Top up {topUpQuote.amount} test sats</h2>
            <div className="zap-qr-placeholder" role="img" aria-label="Cashu test-mint invoice placeholder"><QrCode size={74} strokeWidth={1.5} /></div>
            <textarea className="cashu-token-input cashu-invoice-copy" readOnly value={topUpQuote.invoice} aria-label="Lightning invoice" />
            {activeError && <p className="zap-error-message">{activeError}</p>}
            <button className="zap-copy-invoice" type="button" onClick={() => navigator.clipboard.writeText(topUpQuote.invoice)}><Copy size={17} /> Copy invoice</button>
            <button className="zap-create-invoice" type="button" onClick={checkTopUpInvoice} disabled={wallet.isWorking}>{wallet.isWorking ? "Checking..." : "I paid — add credits"}</button>
          </div>
        )}
      </section>
    </div>
  );
}
