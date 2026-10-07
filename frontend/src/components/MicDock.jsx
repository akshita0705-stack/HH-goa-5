import { useState } from "react";
import { MicIcon, SendIcon, StopIcon, Spinner } from "./icons";

const STATUS = {
  idle: "Tap the microphone and ask your question",
  blocked: "Find a medicine to start asking",
  listening: "Listening. Tap again when you're done.",
  transcribing: "Turning your voice into text",
  thinking: "Looking up the answer",
};

export default function MicDock({ state, canAsk, onToggle, onSubmitText, notice }) {
  const [text, setText] = useState("");
  const listening = state === "listening";
  const busy = state === "transcribing" || state === "thinking";
  const label = !canAsk && !listening ? STATUS.blocked : STATUS[state];

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmitText(text);
    setText("");
  };

  return (
    <div className="sticky bottom-4 mt-6 rounded-3xl border border-white/60 bg-white/85 p-5 shadow-[0_12px_40px_rgba(14,43,37,0.18)] backdrop-blur-xl transition-all">
      {notice && <p role="alert" className="mb-3 rounded-xl border border-alarm-edge bg-alarm-bg/90 px-3 py-2 text-sm text-alarm-text shadow-sm">{notice}</p>}

      <div className="flex flex-col items-center gap-3">
        <div className="group relative flex h-28 w-28 items-center justify-center">
          {/* Ambient luminous halo background */}
          <div
            className={`absolute inset-1 rounded-full blur-xl transition-all duration-700 ${listening
              ? "bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 opacity-95 scale-125 animate-pulse"
              : "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 opacity-70 scale-105 group-hover:scale-115 group-hover:opacity-90"
              }`}
          />

          {listening && (
            <>
              <span className="leaf ripple absolute inset-0 bg-emerald-400/60" />
              <span className="leaf ripple ripple-late absolute inset-0 bg-amber-400/50" />
            </>
          )}

          <button
            type="button"
            onClick={onToggle}
            disabled={(!canAsk && !listening) || busy}
            aria-pressed={listening}
            aria-label={listening ? "Stop recording and send question" : "Start recording a question"}
            className={`leaf relative flex h-24 w-24 items-center justify-center text-white shadow-2xl transition-all duration-300 transform active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:opacity-70 ${listening
              ? "bg-gradient-to-tr from-emerald-500 via-teal-500 to-amber-400 mic-glow-active"
              : "bg-gradient-to-tr from-[#0e2c25] via-[#12372F] to-[#2F8F6B] hover:scale-105 mic-glow-idle"
              }`}
          >
            {busy ? <Spinner className="!h-9 !w-9" /> : listening ? <StopIcon width={36} height={36} /> : <MicIcon width={40} height={40} />}
          </button>
        </div>
        <p className="text-center text-sm font-semibold text-pine" role="status" aria-live="polite">{label}</p>
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="typed-question">Type a question</label>
        <input
          id="typed-question"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!canAsk || busy || listening}
          maxLength={500}
          placeholder="Or type a question..."
          className="min-w-0 flex-1 rounded-2xl border border-emerald-900/15 bg-white/90 px-4 py-3 text-ink placeholder:text-muted focus:border-fern focus:outline-none focus:ring-2 focus:ring-fern/30 disabled:opacity-60 shadow-inner"
        />
        <button type="submit" disabled={!text.trim() || !canAsk || busy || listening}
          className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-pine to-[#1b5e4b] px-5 font-semibold text-white shadow-md hover:from-pine-soft hover:to-fern disabled:bg-line disabled:text-muted disabled:shadow-none transition-all">
          Ask <SendIcon width={16} height={16} />
        </button>
      </form>
    </div>
  );
}
