import { useCallback, useEffect, useRef, useState } from "react";

/** Tap-to-start, tap-to-stop microphone recording. Auto-stops after maxMs. */
export function useRecorder({ onStop, onError, maxMs = 30000 }) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const callbacks = useRef({ onStop, onError });
  callbacks.current = { onStop, onError };

  const release = () => {
    clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      callbacks.current.onError("This browser can't record audio. Try Chrome, Edge or Safari, or type your question.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) =>
        MediaRecorder.isTypeSupported(m)
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onerror = () => {
        release();
        setRecording(false);
        callbacks.current.onError("The recording failed. Try again, or type your question.");
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        release();
        setRecording(false);
        callbacks.current.onStop(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      timerRef.current = setTimeout(() => recorder.state === "recording" && recorder.stop(), maxMs);
    } catch (err) {
      release();
      setRecording(false);
      callbacks.current.onError(
        err?.name === "NotAllowedError"
          ? "Microphone access is blocked. Allow it from the address bar, or type your question."
          : "Couldn't start the microphone. Check that one is connected, or type your question."
      );
    }
  }, [maxMs]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  useEffect(() => release, []);

  return { recording, start, stop };
}
