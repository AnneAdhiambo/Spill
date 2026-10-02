import {
  ArrowDownLeft,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBitcoinUsdEstimate } from "../../hooks/useBitcoinUsdEstimate";
import { useWallet } from "../../hooks/useWallet";

type WalletModalProps = {
  onClose: () => void;
};

type ModalSubView = "home" | "add-funds" | "add-funds-invoice" | "add-funds-success" | "receive" | "receive-success" | "backup-restore";

function formatUsd(estimate: number | null) {
  if (estimate === null) return "USD estimate unavailable";
  return `~ ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(estimate)} USD`;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WalletModal({ onClose }: WalletModalProps) {
  const wallet = useWallet();
  const [passcodeInput, setPasscodeInput] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [subView, setSubView] = useState<ModalSubView>("home");

  // Add Funds State
  const [amountInput, setAmountInput] = useState("21");
  const [invoiceData, setInvoiceData] = useState<{ quoteId: string; invoice: string; expiresAt?: number } | null>(null);
  const [polling, setPolling] = useState(false);
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const [addFundsError, setAddFundsError] = useState<string | null>(null);
  const [addedAmount, setAddedAmount] = useState<number>(0);

  // Receive Token State
  const [receiveTokenInput, setReceiveTokenInput] = useState("");
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [receivedAmount, setReceivedAmount] = useState<number>(0);

  // Backup & Restore State
  const [restoreJsonInput, setRestoreJsonInput] = useState("");
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedAmount = useMemo(() => {
    const val = Number.parseInt(amountInput, 10);
    return Number.isFinite(val) && val > 0 ? val : 0;
  }, [amountInput]);

  const usdEstimate = useBitcoinUsdEstimate(wallet.balance);
  const addFundsUsdEstimate = useBitcoinUsdEstimate(parsedAmount);

  // Auto-polling for active invoice
  useEffect(() => {
    if (subView !== "add-funds-invoice" || !invoiceData || !polling) return;

    const interval = setInterval(async () => {
      try {
        await wallet.claimQuote(invoiceData.quoteId);
        setPolling(false);
        setAddedAmount(parsedAmount);
        setSubView("add-funds-success");
      } catch (err) {
        if (err instanceof Error && err.message.includes("expired")) {
          setPolling(false);
          setAddFundsError("Invoice expired or could not be paid. Create a new one.");
        }
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [subView, invoiceData, polling, wallet, parsedAmount]);

  async function handleUnlockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (wallet.walletExists) {
      const ok = await wallet.unlock(passcodeInput);
      if (ok) setSubView("home");
    } else {
      if (passcodeInput.length < 8) {
        wallet.setError("Passcode must be at least 8 characters long.");
        return;
      }
      if (passcodeInput !== confirmPasscode) {
        wallet.setError("Passcodes do not match. Please try again.");
        return;
      }
      const ok = await wallet.createPasscode(passcodeInput);
      if (ok) setSubView("home");
    }
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (parsedAmount <= 0) return;
    setAddFundsError(null);
    try {
      const res = await wallet.addFundsQuote(parsedAmount);
      setInvoiceData(res);
      setPolling(true);
      setSubView("add-funds-invoice");
    } catch (err) {
      setAddFundsError(err instanceof Error ? err.message : "Could not create Lightning invoice.");
    }
  }

  async function handleCopyInvoice() {
    if (!invoiceData) return;
    await navigator.clipboard.writeText(invoiceData.invoice);
    setCopiedInvoice(true);
    setTimeout(() => setCopiedInvoice(false), 2000);
  }

  async function handleReceiveSubmit(e: React.FormEvent) {
    e.preventDefault();
    setReceiveError(null);
    const token = receiveTokenInput.trim();
    if (!token) return;

    try {
      const snapshot = await wallet.receiveCashuToken(token);
      const latestItem = snapshot.history[0];
      setReceivedAmount(latestItem ? latestItem.amount : 0);
      setReceiveTokenInput("");
      setSubView("receive-success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to receive token.";
      setReceiveError(msg.includes("configured payment provider") ? msg : "Invalid token or server error. Please try again.");
    }
  }

  async function handleExportBackup() {
    try {
      const json = await wallet.exportBackup();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `spill-wallet-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Export failed.");
    }
  }

  async function handleRestoreSubmit(jsonText: string) {
    setRestoreError(null);
    setRestoreSuccess(null);
    if (!jsonText.trim()) return;

    try {
      await wallet.restoreBackup(jsonText.trim());
      setRestoreSuccess("Wallet restored and merged successfully.");
      setRestoreJsonInput("");
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "That wallet backup is not valid.");
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      if (typeof content === "string") {
        handleRestoreSubmit(content);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="zap-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="zap-modal zap-wallet-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="zap-modal-close" type="button" onClick={onClose} aria-label="Close wallet modal">
          <X size={20} />
        </button>

        {/* LOCKED STATE */}
        {!wallet.isUnlocked && (
          <div className="zap-send-screen">
            <span className="zap-modal-kicker">
              <ShieldCheck size={16} /> DEVICE SECURITY
            </span>
            <h2 id="wallet-modal-title">
              {wallet.walletExists ? "Unlock Cashu Wallet" : "Create Device Passcode"}
            </h2>
            <p className="zap-modal-note" style={{ textAlign: "center" }}>
              {wallet.walletExists
                ? "Enter your 8+ character passcode to decrypt your wallet."
                : "Create a device passcode to protect your Cashu balance on this device. Minimum 8 characters."}
            </p>

            <form onSubmit={handleUnlockSubmit} style={{ display: "grid", gap: "14px", marginTop: "16px" }}>
              <div style={{ position: "relative" }}>
                <input
                  type={showPasscode ? "text" : "password"}
                  placeholder="Device passcode (min 8 chars)"
                  value={passcodeInput}
                  onChange={(e) => {
                    setPasscodeInput(e.target.value);
                    if (wallet.error) wallet.setError(null);
                  }}
                  required
                  minLength={8}
                  style={{
                    width: "100%",
                    padding: "12px 42px 12px 14px",
                    borderRadius: "12px",
                    border: "1px solid var(--line)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "15px",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode(!showPasscode)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    cursor: "pointer",
                  }}
                  aria-label={showPasscode ? "Hide passcode" : "Show passcode"}
                >
                  {showPasscode ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {!wallet.walletExists && (
                <input
                  type={showPasscode ? "text" : "password"}
                  placeholder="Confirm device passcode"
                  value={confirmPasscode}
                  onChange={(e) => {
                    setConfirmPasscode(e.target.value);
                    if (wallet.error) wallet.setError(null);
                  }}
                  required
                  minLength={8}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid var(--line)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "15px",
                  }}
                />
              )}

              {wallet.error && (
                <p className="error-message" role="alert" style={{ textAlign: "center", margin: "4px 0" }}>
                  {wallet.error}
                </p>
              )}

              <button className="zap-create-invoice" type="submit" disabled={wallet.loading}>
                {wallet.loading
                  ? "Decrypting..."
                  : wallet.walletExists
                  ? "Unlock Wallet"
                  : "Create & Initialize Wallet"}
              </button>
            </form>
          </div>
        )}

        {/* UNLOCKED HOME STATE */}
        {wallet.isUnlocked && subView === "home" && (
          <div className="zap-send-screen">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="zap-modal-kicker">
                <WalletCards size={16} /> CASHU WALLET
              </span>
              <button
                type="button"
                onClick={wallet.lock}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  border: "none",
                  background: "none",
                  color: "var(--muted)",
                  fontSize: "13px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                <Lock size={14} /> Lock
              </button>
            </div>

            <h2 id="wallet-modal-title" style={{ fontSize: "36px", marginTop: "12px" }}>
              {wallet.balance.toLocaleString()} <span style={{ fontSize: "20px", fontWeight: 700 }}>sats</span>
            </h2>
            <p className="zap-usd-estimate">{formatUsd(usdEstimate)}</p>

            <div
              style={{
                margin: "16px 0",
                padding: "10px 14px",
                borderRadius: "12px",
                border: "1px solid var(--line)",
                background: "var(--card)",
                fontSize: "13px",
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <ShieldCheck size={18} style={{ color: "#ff7a1a", flexShrink: 0 }} />
              <span>
                <strong>This wallet lives on this device.</strong>
              </span>
            </div>

            {/* Quick Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "16px 0" }}>
              <button
                className="zap-create-invoice"
                type="button"
                onClick={() => {
                  setAddFundsError(null);
                  setSubView("add-funds");
                }}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
              >
                <Plus size={18} /> Add funds
              </button>

              <button
                type="button"
                onClick={() => {
                  setReceiveError(null);
                  setSubView("receive");
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "12px",
                  borderRadius: "13px",
                  border: "1px solid var(--line)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontWeight: 800,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                <ArrowDownLeft size={18} /> Receive
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => setSubView("backup-restore")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "none",
                  border: "none",
                  color: "#ff7a1a",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Download size={14} /> Backup & Restore
              </button>
            </div>

            {/* Transaction History */}
            <div style={{ textAlign: "left", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: "16px", color: "var(--text)", fontWeight: 800 }}>
                Transaction History
              </h3>

              {wallet.pending.length > 0 && (
                <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
                  {wallet.pending.map((p) => (
                    <div
                      key={p.quote}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid #f97316",
                        background: "rgba(249, 115, 22, 0.08)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: "14px", color: "#c2410c", display: "block" }}>
                          Pending Funding
                        </strong>
                        <small style={{ color: "var(--muted)", fontSize: "12px" }}>Waiting for payment</small>
                      </div>
                      <span style={{ fontWeight: 800, color: "#c2410c", fontSize: "14px" }}>
                        +{p.amount} sats
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {wallet.history.length === 0 && wallet.pending.length === 0 ? (
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px", textAlign: "center", padding: "16px 0" }}>
                  No transactions yet.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "8px", maxHeight: "200px", overflowY: "auto" }}>
                  {wallet.history.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid var(--line)",
                        background: "var(--card)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: "14px", color: "var(--text)", display: "block" }}>
                          {item.type === "funds"
                            ? "Added funds"
                            : item.type === "received"
                            ? "Received token"
                            : item.type === "zap"
                            ? "Nutzap sent"
                            : "Premium room"}
                        </strong>
                        <small style={{ color: "var(--muted)", fontSize: "12px" }}>{formatDate(item.at)}</small>
                      </div>
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: "14px",
                          color: item.type === "funds" || item.type === "received" ? "#16a34a" : "#dc2626",
                        }}
                      >
                        {item.type === "funds" || item.type === "received" ? `+${item.amount}` : `-${item.amount}`} sats
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ADD FUNDS: AMOUNT SELECTION */}
        {wallet.isUnlocked && subView === "add-funds" && (
          <div className="zap-send-screen">
            <button className="zap-inline-back" type="button" onClick={() => setSubView("home")}>
              <ArrowLeft size={16} /> Back to wallet
            </button>
            <span className="zap-modal-kicker">
              <QrCode size={15} /> ADD FUNDS
            </span>
            <h2 id="wallet-modal-title">How many sats?</h2>

            <label className="zap-wallet-amount" style={{ marginTop: "16px" }}>
              <span className="sr-only">Amount in sats</span>
              <input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                type="text"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value.replace(/\D/g, ""))}
              />
              <span>sats</span>
            </label>
            <p className="zap-usd-estimate">{formatUsd(addFundsUsdEstimate)}</p>

            <div className="zap-amount-options" style={{ margin: "20px 0" }}>
              {[10, 21, 50, 100].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className={parsedAmount === amt ? "is-selected" : ""}
                  onClick={() => setAmountInput(String(amt))}
                >
                  {amt} sats
                </button>
              ))}
            </div>

            {addFundsError && (
              <p className="error-message" role="alert" style={{ marginBottom: "14px" }}>
                {addFundsError}
              </p>
            )}

            <button
              className="zap-create-invoice"
              type="button"
              onClick={handleCreateInvoice}
              disabled={parsedAmount <= 0}
            >
              Create Lightning invoice
            </button>
          </div>
        )}

        {/* ADD FUNDS: INVOICE QR & POLLING */}
        {wallet.isUnlocked && subView === "add-funds-invoice" && invoiceData && (
          <div className="zap-invoice-preview">
            <button
              className="zap-inline-back"
              type="button"
              onClick={() => {
                setPolling(false);
                setSubView("add-funds");
              }}
            >
              <ArrowLeft size={16} /> Change amount
            </button>
            <span className="zap-modal-kicker">
              <QrCode size={15} /> LIGHTNING INVOICE
            </span>
            <h2 id="wallet-modal-title">Pay {parsedAmount} sats</h2>
            <p className="zap-invoice-copy">Scan with any Lightning wallet to fund your Cashu balance.</p>

            <div
              style={{
                background: "#ffffff",
                padding: "16px",
                borderRadius: "18px",
                width: "fit-content",
                margin: "20px auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
            >
              <QRCodeSVG value={invoiceData.invoice} size={180} includeMargin={false} />
            </div>

            {addFundsError ? (
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <p className="error-message" role="alert" style={{ marginBottom: "10px" }}>
                  {addFundsError}
                </p>
                <button
                  className="zap-create-invoice"
                  type="button"
                  onClick={() => {
                    setAddFundsError(null);
                    setSubView("add-funds");
                  }}
                >
                  Create new invoice
                </button>
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    color: "#ff7a1a",
                    fontSize: "14px",
                    fontWeight: 700,
                    marginBottom: "16px",
                  }}
                >
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Waiting for payment...</span>
                </div>

                <button className="zap-copy-invoice" type="button" onClick={handleCopyInvoice}>
                  <Copy size={17} /> {copiedInvoice ? "Copied!" : "Copy Lightning Invoice"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ADD FUNDS: SUCCESS */}
        {wallet.isUnlocked && subView === "add-funds-success" && (
          <div className="zap-invoice-preview zap-complete-preview">
            <span className="zap-modal-kicker">
              <CheckCircle2 size={15} /> FUNDS ADDED
            </span>
            <h2 id="wallet-modal-title">Payment Confirmed</h2>
            <p>Added {addedAmount} sats to your device wallet.</p>
            <CheckCircle2 className="zap-complete-icon" size={74} strokeWidth={1.4} aria-hidden="true" />
            <button className="zap-copy-invoice" type="button" onClick={() => setSubView("home")}>
              Back to wallet
            </button>
          </div>
        )}

        {/* RECEIVE TOKEN */}
        {wallet.isUnlocked && subView === "receive" && (
          <div className="zap-send-screen">
            <button className="zap-inline-back" type="button" onClick={() => setSubView("home")}>
              <ArrowLeft size={16} /> Back to wallet
            </button>
            <span className="zap-modal-kicker">
              <ArrowDownLeft size={15} /> RECEIVE TOKEN
            </span>
            <h2 id="wallet-modal-title">Paste Cashu Token</h2>
            <p className="zap-modal-note" style={{ textAlign: "center" }}>
              Paste a Cashu token below to claim sats to your device wallet.
            </p>

            <form onSubmit={handleReceiveSubmit} style={{ display: "grid", gap: "14px", marginTop: "16px" }}>
              <textarea
                rows={4}
                placeholder="Paste cashuA... token here"
                value={receiveTokenInput}
                onChange={(e) => {
                  setReceiveTokenInput(e.target.value);
                  if (receiveError) setReceiveError(null);
                }}
                required
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "12px",
                  border: "1px solid var(--line)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  resize: "vertical",
                }}
              />

              {receiveError && (
                <p className="error-message" role="alert" style={{ textAlign: "center" }}>
                  {receiveError}
                </p>
              )}

              <button className="zap-create-invoice" type="submit" disabled={!receiveTokenInput.trim()}>
                Receive Sats
              </button>
            </form>
          </div>
        )}

        {/* RECEIVE SUCCESS */}
        {wallet.isUnlocked && subView === "receive-success" && (
          <div className="zap-invoice-preview zap-complete-preview">
            <span className="zap-modal-kicker">
              <CheckCircle2 size={15} /> TOKEN RECEIVED
            </span>
            <h2 id="wallet-modal-title">Token Claimed</h2>
            <p>Received {receivedAmount} sats into your wallet.</p>
            <CheckCircle2 className="zap-complete-icon" size={74} strokeWidth={1.4} aria-hidden="true" />
            <button className="zap-copy-invoice" type="button" onClick={() => setSubView("home")}>
              Back to wallet
            </button>
          </div>
        )}

        {/* BACKUP & RESTORE */}
        {wallet.isUnlocked && subView === "backup-restore" && (
          <div className="zap-send-screen">
            <button className="zap-inline-back" type="button" onClick={() => setSubView("home")}>
              <ArrowLeft size={16} /> Back to wallet
            </button>
            <span className="zap-modal-kicker">
              <ShieldCheck size={15} /> BACKUP & RESTORE
            </span>
            <h2 id="wallet-modal-title">Manage Wallet Backup</h2>

            <div
              style={{
                margin: "14px 0",
                padding: "10px 14px",
                borderRadius: "12px",
                border: "1px solid var(--line)",
                background: "var(--card)",
                fontSize: "13px",
                color: "var(--muted)",
                textAlign: "left",
              }}
            >
              <strong>This wallet lives on this device.</strong> Export an encrypted backup to move or restore your
              wallet. Restoring merges proofs, quotes, and history into your existing wallet without overwriting.
            </div>

            {restoreSuccess && (
              <p style={{ color: "#16a34a", fontWeight: 700, fontSize: "14px", margin: "8px 0" }}>
                {restoreSuccess}
              </p>
            )}

            {restoreError && (
              <p className="error-message" role="alert" style={{ margin: "8px 0" }}>
                {restoreError}
              </p>
            )}

            <div style={{ display: "grid", gap: "16px", marginTop: "16px", textAlign: "left" }}>
              <div style={{ padding: "14px", border: "1px solid var(--line)", borderRadius: "14px", background: "var(--card)" }}>
                <h4 style={{ margin: "0 0 6px", fontSize: "15px", color: "var(--text)" }}>Export Backup</h4>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--muted)" }}>
                  Download an encrypted backup file containing your wallet proofs and history.
                </p>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "none",
                    background: "var(--brand-gradient)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  <Download size={16} /> Export Encrypted Backup
                </button>
              </div>

              <div style={{ padding: "14px", border: "1px solid var(--line)", borderRadius: "14px", background: "var(--card)" }}>
                <h4 style={{ margin: "0 0 6px", fontSize: "15px", color: "var(--text)" }}>Restore Backup</h4>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--muted)" }}>
                  Select a backup file or paste your backup JSON. Restoring merges proofs safely.
                </p>

                <input
                  type="file"
                  accept=".json"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />

                <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid var(--line)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    <Upload size={16} /> Select Backup File
                  </button>
                </div>

                <textarea
                  rows={3}
                  placeholder="Or paste backup JSON here..."
                  value={restoreJsonInput}
                  onChange={(e) => setRestoreJsonInput(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid var(--line)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    marginBottom: "10px",
                  }}
                />

                <button
                  type="button"
                  onClick={() => handleRestoreSubmit(restoreJsonInput)}
                  disabled={!restoreJsonInput.trim()}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "1px solid var(--line)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: restoreJsonInput.trim() ? "pointer" : "not-allowed",
                    opacity: restoreJsonInput.trim() ? 1 : 0.6,
                  }}
                >
                  Restore & Merge
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
