import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, MAX_DICTATION_SEC } from "./config";

export type DictationState = "idle" | "recording" | "transcribing";

/** Records from the mic, sends the audio ONLY to POST /api/v1/transcribe, and keeps nothing. */
export function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const stop = useCallback(() => { if (recorder.current?.state === "recording") recorder.current.stop(); }, []);

  const start = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setError("Microphone access was blocked."); return; }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      window.clearInterval(timer.current);
      stream.getTracks().forEach((t) => t.stop());
      setState("transcribing");
      try {
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("file", blob, "dictation");
        const res = await fetch(`${API_URL}/api/v1/transcribe`, { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || `Transcription failed (${res.status}).`);
        if (!body.text) throw new Error("No speech was recognised.");
        onText(String(body.text).trim());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transcription failed.");
      } finally { setState("idle"); setSeconds(0); }
    };
    recorder.current = rec;
    rec.start();
    setState("recording"); setSeconds(0);
    const began = Date.now();
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= MAX_DICTATION_SEC) stop();
    }, 250);
  }, [onText, stop]);

  useEffect(() => () => { window.clearInterval(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); }, []);

  return { state, seconds, error, start, stop };
}
