import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, MAX_DICTATION_SEC } from "./config";

export type DictationState = "idle" | "recording" | "transcribing";

/** Records from the mic, sends the audio ONLY to POST /api/v1/transcribe, and keeps nothing. */
export function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const releaseAudio = useRef<() => void>(() => {});

  const stop = useCallback(() => { if (recorder.current?.state === "recording") recorder.current.stop(); }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.onLine) { setError("Dictation needs a connection"); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(name === "NotAllowedError" || name === "SecurityError"
        ? "Microphone permission was denied. Allow microphone access for this site in your browser settings, then try again."
        : name === "NotFoundError" ? "No microphone was found on this device." : "The microphone could not be started.");
      return;
    }

    // Live input level: AnalyserNode on the stream, RMS volume scaled to 0..1.
    let ctx: AudioContext | null = null;
    let raf = 0;
    try {
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* no meter; recording still works */ }
    let released = false;
    releaseAudio.current = () => {
      if (released) return;
      released = true;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      setLevel(0);
    };
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      window.clearInterval(timer.current);
      releaseAudio.current();
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

  useEffect(() => () => {
    window.clearInterval(timer.current);
    if (recorder.current) recorder.current.onstop = null; // unmounted: do not transcribe
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseAudio.current();
  }, []);

  return { state, seconds, error, level, start, stop };
}
