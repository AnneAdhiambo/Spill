import { ShieldCheck } from "lucide-react"

export default function MediaTrustBadge() {
  return (
    <span className="trust-badge">
      <ShieldCheck size={16} />
      Media verified
    </span>
  )
}
