import { useCallback, useEffect, useState } from "react"
import { Camera, CheckCircle2, Copy, ImageOff, X } from "lucide-react"
import { nip19 } from "nostr-tools"
import TopNavbar from "../components/communities/TopNavbar"
import PostSyncBadge from "../features/offline/PostSyncBadge"
import { API_URL, MAX_POST_CHARS } from "../features/post/config"
import { cleanPhoto, type CleanPhoto } from "../features/post/image"
import { submitPost, type SubmitOutcome } from "../features/post/submitPost"
import { useOnline } from "../features/post/useOnline"
import { SessionSigner } from "../features/post/signer"
import { useDictation } from "../features/post/useDictation"
import DictationMic from "../features/post/DictationMic"
import { communityService } from "../services/nostr/communityService"
import "../styles/communities.css"
import "../styles/post.css"

const signer = new SessionSigner()

export default function PostPage() {
  const community = new URLSearchParams(window.location.search).get("community")?.trim() || ""
  const [text, setText] = useState("")
  const [area, setArea] = useState("")
  const [photo, setPhoto] = useState<CleanPhoto | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null)
  const [sensitive, setSensitive] = useState(false)
  const [sensitiveReason, setSensitiveReason] = useState("violence")
  const [copied, setCopied] = useState(false)
  const online = useOnline()
  const [communityName, setCommunityName] = useState<string | null>(null)
  useEffect(() => {
    if (community) void communityService.getCommunity(community).then((c) => setCommunityName(c?.name ?? null))
  }, [community])

  const onDictated = useCallback((t: string) => setText((prev) => (prev ? `${prev.trimEnd()} ${t}` : t).slice(0, MAX_POST_CHARS)), [])
  const dictation = useDictation(onDictated)
  const [dictated, setDictated] = useState(false)
  useEffect(() => { if (dictation.state === "transcribing") setDictated(true) }, [dictation.state])

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])

  async function onPhoto(file: File | undefined) {
    if (!file) return
    setPhotoError(null); setPhotoBusy(true)
    try {
      const cleaned = await cleanPhoto(file)
      setPhoto(cleaned)
      setPhotoUrl(URL.createObjectURL(cleaned.blob))
    } catch (err) {
      setPhoto(null); setPhotoUrl(null)
      setPhotoError(err instanceof Error ? err.message : "Could not process that photo.")
    } finally { setPhotoBusy(false) }
  }

  async function publish() {
    setPublishing(true); setError(null)
    try {
      let uploaded = null
      if (photo) {
        // A post whose photo is not uploaded yet is never queued.
        if (!navigator.onLine) throw new Error("The photo needs a connection to upload. Reconnect, or remove the photo to post now.")
        // Only the cleaned file is uploaded; the original never leaves the device.
        const form = new FormData()
        form.append("file", photo.blob, "photo")
        const res = await fetch(`${API_URL}/api/v1/media`, { method: "POST", body: form })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(`Photo upload failed (${body?.error ?? res.status}).`)
        if (body.sha256 !== photo.sha256) throw new Error("Photo upload failed: the server stored different bytes.")
        uploaded = { url: body.url as string, sha256: photo.sha256, mime: photo.mime, sensitiveReason: sensitive ? sensitiveReason : null }
      }
      setOutcome(await submitPost({ text, area, communityId: community, photo: uploaded }, signer, navigator.onLine))
    } catch (err) {
      if (err instanceof Error && err.message === "Please sign in first.") {
        window.location.replace(`/get-started?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
        return
      }
      setError(err instanceof Error ? err.message : "Publishing failed.")
    } finally { setPublishing(false); setConfirming(false) }
  }

  function viewOnNostrUrl(o: SubmitOutcome) {
    const relays = o.relayResults.filter((r) => r.accepted && r.relay.startsWith("wss://")).map((r) => r.relay)
    return `https://njump.me/${nip19.neventEncode({ id: o.event.id, relays, author: o.event.pubkey })}`
  }
  async function copyId(id: string) {
    try { await navigator.clipboard.writeText(id); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setError("Couldn't copy the id.") }
  }

  const busy = dictation.state !== "idle"
  const canPost = Boolean(community) && text.trim().length > 0 && !busy && !photoBusy && !publishing

  return (
    <div className="communities-page page-shell">
      <TopNavbar />
      <main className="post-page">
        {outcome ? (
          <section className="post-card post-done" role="status">
            <CheckCircle2 size={40} aria-hidden="true" />
            <h1>{outcome.posted ? "Posted" : "Saved on this device"}</h1>
            <p>{outcome.posted ? "A relay accepted your post." : "Saved on this device. It will send when you're online."}</p>
            {outcome.enqueue === "duplicate" && <p className="post-muted">This exact post was already saved on this device.</p>}
            <p className="post-muted">Sync status: <PostSyncBadge entityId={outcome.event.id} />{outcome.syncStatus === "synced" && " Synced"}</p>
            {outcome.relayResults.length > 0 && (
              <ul className="post-relays" aria-label="Relay results">
                {outcome.relayResults.map((r) => (
                  <li key={r.relay}><code>{r.relay}</code>: {r.accepted ? "accepted" : "rejected"}{r.message && r.message !== "OK" ? ` (${r.message})` : ""}</li>
                ))}
              </ul>
            )}
            {outcome.inOutbox && <p className="post-muted">It will be sent to a relay when a connection is available.</p>}
            <p className="post-muted">Event id <code>{outcome.event.id.slice(0, 12)}</code>{" "}
              <button type="button" className="post-copy" onClick={() => void copyId(outcome.event.id)}><Copy size={13} aria-hidden="true" /> {copied ? "Copied" : "Copy id"}</button>
            </p>
            {outcome.posted && <a className="post-link" href={viewOnNostrUrl(outcome)} target="_blank" rel="noreferrer">View on Nostr</a>}
            {!outcome.posted && <a className="post-link" href="/communities">Share it with someone nearby (the "Share N waiting" card at the top of Communities)</a>}
            <a className="post-link" href="/communities">Back to Communities</a>
          </section>
        ) : (
          <section className="post-card">
            <h1>Write a post</h1>
            {community ? <p className="post-community">Posting in <strong>{communityName ?? community}</strong></p> : <p className="post-error" role="alert">Choose a community first. <a className="post-link" href="/communities">Go to Communities</a></p>}

            <DictationMic state={dictation.state} seconds={dictation.seconds} level={dictation.level} online={online} onStart={dictation.start} onStop={dictation.stop} />

            <label className="post-label" htmlFor="post-text">What’s happening?</label>
            <textarea id="post-text" value={text} maxLength={MAX_POST_CHARS} rows={7} disabled={dictation.state === "transcribing"}
              onChange={(e) => setText(e.target.value)} placeholder="Type here, or tap the microphone to speak." />
            <div className="post-row">
              <span />
              <span className="post-muted" aria-live="polite">{text.length} / {MAX_POST_CHARS}</span>
            </div>
            {dictated && <p className="post-muted">Transcribed automatically. Check it before you post, especially Swahili and Sheng.</p>}
            {dictation.error && <p className="post-error" role="alert">{dictation.error}</p>}

            <div className="post-photo">
              {!photo && (
                <label className={`post-add-photo${online ? "" : " is-disabled"}`} aria-disabled={!online}>
                  <Camera size={18} aria-hidden="true" /> {photoBusy ? "Cleaning photo…" : online ? "Add photo" : "Add photo · Needs a connection"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={photoBusy || !online} onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = "" }} />
                </label>
              )}
              {photo && photoUrl && (
                <div className="post-preview">
                  <img src={photoUrl} alt="Selected photo preview" />
                  <button type="button" className="post-remove" aria-label="Remove photo" onClick={() => { setPhoto(null); setPhotoUrl(null) }}><X size={16} /></button>
                  <span className="post-chip"><ImageOff size={13} aria-hidden="true" /> Metadata removed</span>
                </div>
              )}
              {photo && (
                <label className="post-muted post-sensitive">
                  <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} /> This photo may be distressing (viewers must tap to reveal it)
                  {sensitive && (
                    <select value={sensitiveReason} onChange={(e) => setSensitiveReason(e.target.value)} aria-label="Why is it sensitive?">
                      <option value="violence">Violence</option>
                      <option value="death">Death</option>
                      <option value="gender-based violence">Gender-based violence</option>
                    </select>
                  )}
                </label>
              )}
              {photo && <p className="post-muted">This doesn’t prove the photo is real.{photo.notes.length > 0 && ` The original contained: ${photo.notes.join("; ")}.`}</p>}
              {photoError && <p className="post-error" role="alert">{photoError}</p>}
            </div>

            <label className="post-label" htmlFor="post-area">Area (optional)</label>
            <input id="post-area" type="text" maxLength={60} value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Kibera" autoComplete="off" />
            <p className="post-muted">Neighborhood only, never an exact address.</p>

            {error && <p className="post-error" role="alert">{error}</p>}
            <button type="button" className="post-submit" disabled={!canPost} onClick={() => setConfirming(true)}>
              {publishing ? "Publishing…" : "Post"}
            </button>
          </section>
        )}
      </main>

      {confirming && (
        <div className="post-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="post-modal-box">
            <h2 id="confirm-title">Post as your session pseudonym?</h2>
            <p>Posts you make while signed in share this pseudonym. Published posts are public and can't be reliably deleted.</p>
            <div className="post-modal-actions">
              <button type="button" onClick={() => setConfirming(false)} disabled={publishing}>Cancel</button>
              <button type="button" className="post-submit" onClick={publish} disabled={publishing}>{publishing ? "Publishing…" : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
