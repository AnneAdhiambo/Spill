"use client"

import { Check, EyeOff, ShieldAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api"

type Verification = { configured: boolean; status: string; network: string; capabilities: string[] }
type Disclosure = { reveal: string[]; hide: string[]; policy: string }

export function VerificationConsole() {
  const [verification, setVerification] = useState<Verification | null>(null)
  const [disclosure, setDisclosure] = useState<Disclosure | null>(null)
    // Verification console removed during Midnight cleanup.
    return <div className="p-4 text-sm text-muted-foreground">Verification UI removed.</div>
}
