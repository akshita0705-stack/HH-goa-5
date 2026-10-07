import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useRecorder } from "./hooks/useRecorder";
import { useSpeech } from "./hooks/useSpeech";
import Header from "./components/Header";
import Conversation from "./components/Conversation";
import MicDock from "./components/MicDock";
import MedicineFinder from "./components/MedicineFinder";
import { AlertIcon } from "./components/icons";

const DISCLAIMER =
  "This application provides information from official medicine labels only. It does not provide medical diagnosis or personalized medical advice. Always follow your doctor or pharmacist's instructions.";

export default function App() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [health, setHealth] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [messages, setMessages] = useState([]);
  const [transcribing, setTranscribing] = useState(false);
  const [notice, setNotice] = useState("");
  const speech = useSpeech();
  const { speak, stop: stopSpeech } = speech;

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: "offline" }));
  }, []);

  const patchMessage = (id, patch) => setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const removeMedicine = (m) => {
    api.removeDocument(sessionId, m.doc_id).catch(() => { });
    setMedicines((ms) => ms.filter((x) => x.doc_id !== m.doc_id));
  };

  const clearConversation = () => {
    stopSpeech();
    setMessages([]);
    setNotice("");
  };

  // ---- ask (RAG) + speak ---------------------------------------------------
  const ask = useCallback(
    async (text, viaVoice = false) => {
      const question = (text || "").trim();
      if (!question) {
        setNotice("I didn't catch a question. Tap the microphone and try again, or type it.");
        return;
      }
      setNotice("");
      stopSpeech();
      const id = crypto.randomUUID();
      const history = messagesRef.current
        .filter((m) => m.status === "done")
        .slice(-4)
        .map((m) => ({ question: m.question, answer: m.answer }));
      setMessages((ms) => [...ms, { id, question, viaVoice, status: "pending" }]);
      try {
        const res = await api.ask(sessionId, question, history);
        patchMessage(id, { status: "done", ...res });
        speak(id, res.answer);
      } catch (err) {
        patchMessage(id, { status: "error", error: err.message });
      }
    },
    [sessionId, speak, stopSpeech]
  );

  // ---- voice -> Whisper -> ask --------------------------------------------
  const handleRecorded = useCallback(
    async (blob) => {
      setTranscribing(true);
      setNotice("");
      let text;
      try {
        ({ text } = await api.transcribe(blob));
      } catch (err) {
        setNotice(err.message);
        return;
      } finally {
        setTranscribing(false);
      }
      await ask(text, true);
    },
    [ask]
  );

  const recorder = useRecorder({ onStop: handleRecorded, onError: setNotice });

  const toggleMic = () => {
    if (recorder.recording) recorder.stop();
    else {
      stopSpeech();
      setNotice("");
      recorder.start();
    }
  };

  const readyCount = medicines.length;
  const thinking = messages.some((m) => m.status === "pending");
  const micState = recorder.recording ? "listening" : transcribing ? "transcribing" : thinking ? "thinking" : "idle";

  return (
    <div className="min-h-screen goa-bg text-ink relative font-sans">
      <div className="mx-auto max-w-6xl px-4 pb-12">
        <Header health={health} />

        <aside role="note" className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-300/50 bg-amber-50/90 backdrop-blur-md px-4 py-3.5 text-amber-950 shadow-lg">
          <AlertIcon className="mt-0.5 shrink-0 text-amber-700" />
          <p className="text-sm font-medium leading-relaxed">{DISCLAIMER}</p>
        </aside>

        <main className="mt-6 grid items-start gap-6 lg:grid-cols-[340px_1fr]">
          <MedicineFinder
            sessionId={sessionId}
            medicines={medicines}
            onLoaded={(m) => setMedicines((ms) => [...ms, m])}
            onRemove={removeMedicine}
          />
          <div>
            <Conversation
              messages={messages}
              speech={speech}
              canAsk={readyCount > 0}
              onAsk={ask}
              onClear={clearConversation}
            />
            <MicDock
              state={micState}
              canAsk={readyCount > 0}
              onToggle={toggleMic}
              onSubmitText={(t) => ask(t, false)}
              notice={notice}
            />
          </div>
        </main>
      </div>
    </div>
  );
}