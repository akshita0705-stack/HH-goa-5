import { useCallback, useEffect, useRef, useState } from "react";

const supported = typeof window !== "undefined" && "speechSynthesis" in window;

/** Split into short pieces: some browsers cut off long utterances. */
function pieces(text, max = 180) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const out = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > max) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Browser text-to-speech with play / stop / replay semantics. */
export function useSpeech() {
  const [speakingId, setSpeakingId] = useState(null);
  const [error, setError] = useState("");
  const token = useRef(0);

  const stop = useCallback(() => {
    token.current += 1;
    if (supported) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);

  const speak = useCallback((id, text) => {
    if (!supported) {
      setError("Voice playback isn't supported in this browser. You can still read the answer.");
      return;
    }
    setError("");
    const synth = window.speechSynthesis;
    synth.cancel();
    const mine = ++token.current;
    const parts = pieces(text);
    setSpeakingId(id);
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = "en-US";
      u.rate = 0.95;
      u.onerror = (e) => {
        if (mine !== token.current || e.error === "canceled" || e.error === "interrupted") return;
        setError(
          e.error === "not-allowed"
            ? "Your browser blocked automatic playback. Press Play to hear the answer."
            : "Voice playback failed. You can still read the answer."
        );
        setSpeakingId(null);
      };
      if (i === parts.length - 1) {
        u.onend = () => mine === token.current && setSpeakingId(null);
      }
      synth.speak(u);
    });
  }, []);

  useEffect(() => () => supported && window.speechSynthesis.cancel(), []);

  return { supported, speakingId, speak, stop, error, clearError: () => setError("") };
}
