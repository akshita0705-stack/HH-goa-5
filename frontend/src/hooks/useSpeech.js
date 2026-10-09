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

/** An English voice that is really installed on this device (local voices work offline and fail less). */
function pickVoice() {
  if (!supported) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const rank = (v) => {
    const pref = ["en-in", "en-us", "en-gb"].indexOf(v.lang.replace("_", "-").toLowerCase());
    return (v.localService ? 0 : 10) + (pref === -1 ? 5 : pref);
  };
  return [...english].sort((a, b) => rank(a) - rank(b))[0] || null;
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
    const mine = ++token.current;
    const parts = pieces(text);
    setSpeakingId(id);
    let handled = -1; // so several failing pieces only trigger one retry

    const start = (attempt) => {
      synth.cancel();
      // Chrome can drop a speak() that is issued in the same moment as cancel(), so wait briefly.
      setTimeout(() => {
        if (mine !== token.current) return;
        const voice = attempt === 0 ? pickVoice() : null; // retry with the browser's own default voice
        parts.forEach((part, i) => {
          const u = new SpeechSynthesisUtterance(part);
          if (voice) {
            u.voice = voice;
            u.lang = voice.lang;
          }
          u.rate = 0.95;
          u.onerror = (e) => {
            if (mine !== token.current || e.error === "canceled" || e.error === "interrupted") return;
            if (handled >= attempt) return;
            handled = attempt;
            if (e.error === "not-allowed") {
              setError("Your browser blocked automatic playback. Press Play to hear the answer.");
              setSpeakingId(null);
              return;
            }
            if (attempt === 0) {
              start(1);
              return;
            }
            setError(
              `Voice playback failed (${e.error || "unknown error"}). Your device may have no English text-to-speech voice installed. You can still read the answer.`
            );
            setSpeakingId(null);
          };
          if (i === parts.length - 1) {
            u.onend = () => mine === token.current && setSpeakingId(null);
          }
          synth.speak(u);
        });
      }, 60);
    };
    start(0);
  }, []);

  useEffect(() => {
    if (!supported) return undefined;
    const synth = window.speechSynthesis;
    const load = () => synth.getVoices(); // browsers load the voice list lazily; this primes it
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => {
      synth.removeEventListener?.("voiceschanged", load);
      synth.cancel();
    };
  }, []);

  return { supported, speakingId, speak, stop, error, clearError: () => setError("") };
}