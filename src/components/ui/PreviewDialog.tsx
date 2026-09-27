import { useEffect, useRef } from "react";
import { ArrowRight, Radio, X } from "lucide-react";
export type DialogKind = "join" | "video" | "learn";
export function PreviewDialog({
  kind,
  onClose,
}: {
  kind: DialogKind | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (kind) ref.current?.showModal();
    else ref.current?.close();
  }, [kind]);
  return (
    <dialog
      ref={ref}
      className="preview-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <button
        className="dialog-close"
        aria-label="Close dialog"
        onClick={onClose}
      >
        <X />
      </button>
      <Radio className="dialog-icon" size={40} />
      <p className="eyebrow">SPILL IS JUST BEGINNING</p>
      <h2 id="dialog-title">
        {kind === "video"
          ? "Every voice has a story."
          : kind === "learn"
            ? "A new home for your voice."
            : "Be part of what comes next."}
      </h2>
      <p>
        {kind === "video"
          ? "Our introduction film is coming soon. In the meantime, explore the vision: independent stories, connected communities, and conversations that cross borders."
            : "Spill is taking shape. Reporting, communities, radio and user-owned identities are planned for upcoming releases. This is a first look at the platform."}
      </p>
      <p>No accounts or sign-ups are available yet.</p>
      <button className="button primary" onClick={onClose}>
        Keep exploring <ArrowRight size={18} />
      </button>
    </dialog>
  );
}
