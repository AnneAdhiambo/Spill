import { nip19 } from "nostr-tools"

export function validateNpub(npub: string): boolean {
  try {
    const decoded = nip19.decode(npub)
    return decoded && decoded.type === "npub"
  } catch {
    return false
  }
}

export default validateNpub
