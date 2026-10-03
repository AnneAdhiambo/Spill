import { useCallback, useEffect, useState } from "react"
import { Camera, CheckCircle2, ImageOff, Loader2, Mic, Square, X } from "lucide-react"
import TopNavbar from "../components/communities/TopNavbar"
import { API_URL, MAX_POST_CHARS } from "../features/post/config"
import { cleanPhoto, type CleanPhoto } from "../features/post/image"
import { publishPost } from "../features/post/publish"
import { OneTimeKeySigner } from "../features/post/signer"
import { useDictation } from "../features/post/useDictation"
import "../styles/communities.css"
import "../styles/post.css"

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
const signer = new OneTimeKeySigner()

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
  const [done, setDone] = useState(false)

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
        // Only the cleaned file is uploaded; the original never leaves the device.
        const form = new FormData()
        form.append("file", photo.blob, "photo")
        const res = await fetch(`${API_URL}/api/v1/media`, { method: "POST", body: form })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(`Photo upload failed (${body?.error ?? res.status}).`)
        if (body.sha256 !== photo.sha256) throw new Error("Photo upload failed: the server stored different bytes.")
        uploaded = { url: body.url as string, sha256: photo.sha256, mime: photo.mime }
      }
      await publishPost({ text, area, community: community || undefined, photo: uploaded }, signer)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publishing failed.")
    } finally { setPublishing(false); setConfirming(false) }
  }

  const busy = dictation.state !== "idle"
  const canPost = text.trim().length > 0 && !busy && !photoBusy && !publishing

  return (
    <div className="communities-page page-shell">
      <TopNavbar />
      <main className="post-page">
        {done ? (
          <section className="post-card post-done" role="status">
            <CheckCircle2 size={40} aria-hidden="true" />
            <h1>Posted</h1>
            <p>Your post was accepted by at least one relay.</p>
            <a className="post-link" href="/feed">Back to the feed</a>
          </section>
        ) : (
          <section className="post-card">
            <h1>Write a post</h1>
            {community && <p className="post-community">Posting in <strong>{community}</strong></p>}

            <label className="post-label" htmlFor="post-text">What’s happening?</label>
            <textarea id="post-text" value={text} maxLength={MAX_POST_CHARS} rows={7} disabled={dictation.state === "transcribing"}
              onChange={(e) => setText(e.target.value)} placeholder="Type here, or tap the microphone to speak." />
            <div className="post-row">
              <div className="post-dictate">
                {dictation.state === "idle" && (
                  <button type="button" className="post-mic" onClick={dictation.start} aria-label="Start dictation"><Mic size={18} aria-hidden="true" /> Dictate</button>
                )}
                {dictation.state === "recording" && (
                  <button type="button" className="post-mic is-recording" onClick={dictation.stop} aria-label="Stop dictation">
                    <span className="post-dot" aria-hidden="true" /> <Square size={14} fill="currentColor" aria-hidden="true" /> {fmt(dictation.seconds)} / 2:00
                  </button>
                )}
                {dictation.state === "transcribing" && <span className="post-muted"><Loader2 className="spin" size={16} aria-hidden="true" /> Transcribing…</span>}
              </div>
              <span className="post-muted" aria-live="polite">{text.length} / {MAX_POST_CHARS}</span>
            </div>
            {dictated && <p className="post-muted">Transcribed automatically. Check it before you post, especially Swahili and Sheng.</p>}
            {dictation.error && <p className="post-error" role="alert">{dictation.error}</p>}

            <div className="post-photo">
              {!photo && (
                <label className="post-add-photo">
                  <Camera size={18} aria-hidden="true" /> {photoBusy ? "Cleaning photo…" : "Add photo"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={photoBusy} onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = "" }} />
                </label>
              )}
              {photo && photoUrl && (
                <div className="post-preview">
                  <img src={photoUrl} alt="Selected photo preview" />
                  <button type="button" className="post-remove" aria-label="Remove photo" onClick={() => { setPhoto(null); setPhotoUrl(null) }}><X size={16} /></button>
                  <span className="post-chip"><ImageOff size={13} aria-hidden="true" /> Metadata removed</span>
                </div>
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
            <h2 id="confirm-title">Post publicly?</h2>
            <p>Published posts can’t be reliably deleted.</p>
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
