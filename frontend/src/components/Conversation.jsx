import { useEffect, useRef } from "react";
import { AlertIcon, MicIcon, PlayIcon, ReplayIcon, StopIcon } from "./icons";

const SUGGESTIONS = [
  "What is this medicine used for?",
  "How do I use it?",
  "What warnings are mentioned?",
  "When should I stop using it?",
];

function Controls({ id, answer, speech }) {
  const speaking = speech.speakingId === id;
  const btn = "flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-pine hover:bg-mint disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Voice playback">
      <button type="button" className={btn} onClick={() => speech.speak(id, answer)} disabled={speaking || !speech.supported}>
        <PlayIcon width={14} height={14} /> Play
      </button>
      <button type="button" className={btn} onClick={speech.stop} disabled={!speaking}>
        <StopIcon width={14} height={14} /> Stop
      </button>
      <button type="button" className={btn} onClick={() => speech.speak(id, answer)} disabled={!speech.supported}>
        <ReplayIcon width={14} height={14} /> Replay
      </button>
    </div>
  );
}

function Sources({ sources }) {
  if (!sources.length) return null;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="text-sm font-semibold text-pine">Where this comes from</h3>
      <ul className="mt-2 space-y-3">
        {sources.map((s, i) => (
          <li key={i} className="rounded-lg bg-mint/60 p-3 text-sm">
            <p className="font-medium text-pine">{s.label}</p>
            <blockquote className="mt-1 border-l-2 border-fern pl-3 text-ink/90">{s.excerpt}</blockquote>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Answer({ m, speech }) {
  if (m.status === "pending")
    return (
      <p className="flex items-center gap-1 text-muted" role="status">
        Looking up the answer <span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
      </p>
    );
  if (m.status === "error")
    return <p role="alert" className="text-alarm-text">{m.error}</p>;
  return (
    <>
      {m.emergency && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-alarm-edge bg-alarm-bg px-3 py-2 text-sm font-medium text-alarm-text">
          <AlertIcon className="mt-0.5 shrink-0" width={18} height={18} />
          If you have severe or emergency symptoms, contact a healthcare professional or your local emergency service now.
        </p>
      )}
      <p className={`text-lg leading-relaxed ${m.found ? "text-ink" : "text-muted"}`}>{m.answer}</p>
      <Controls id={m.id} answer={m.answer} speech={speech} />
      <Sources sources={m.sources} />
    </>
  );
}

export default function Conversation({ messages, speech, canAsk, onAsk, onClear }) {
  const endRef = useRef(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [messages]);

  return (
    <section aria-labelledby="chat-heading" className="rounded-3xl glass-panel p-5 transition-all">
      <div className="flex items-center justify-between gap-3">
        <h2 id="chat-heading" className="font-display text-lg font-semibold text-pine">Conversation</h2>
        {messages.length > 0 && (
          <button type="button" onClick={onClear} className="text-sm font-medium text-muted hover:text-alarm-text">
            Clear conversation
          </button>
        )}
      </div>

      {messages.length === 0 ? (
        <div className="py-8">
          <p className="max-w-md font-display text-2xl font-semibold leading-snug text-pine">
            {canAsk ? "Ask anything about this medicine." : "Find a medicine to begin."}
          </p>
          <p className="mt-2 max-w-md text-muted">
            {canAsk
              ? "Answers come only from the official label, with the exact lines shown so you can check them. Follow-ups like “What about children?” work too."
              : "Take a photo of the box, say the medicine name, or type it. Once it's ready, tap the microphone and ask your question."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" disabled={!canAsk} onClick={() => onAsk(s, false)}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-pine hover:bg-mint disabled:opacity-50 disabled:hover:bg-transparent">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ol className="mt-4 space-y-6" aria-live="polite">
          {messages.map((m) => (
            <li key={m.id} className="space-y-3">
              <div className="flex flex-col items-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-pine px-4 py-2.5 text-white">{m.question}</p>
                {m.viaVoice && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted"><MicIcon width={12} height={12} /> Recognized from your voice</span>
                )}
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-line bg-paper p-4">
                <Answer m={m} speech={speech} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {speech.error && <p role="alert" className="mt-4 text-sm text-alarm-text">{speech.error}</p>}
      <div ref={endRef} />
    </section>
  );
}
