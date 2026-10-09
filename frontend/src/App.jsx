import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useRecorder } from "./hooks/useRecorder";
import { useSpeech } from "./hooks/useSpeech";
import Header from "./components/Header";
import Conversation from "./components/Conversation";
import MicDock from "./components/MicDock";
import MedicineFinder from "./components/MedicineFinder";
import ChatTabs, { medicineName } from "./components/ChatTabs";
import { AlertIcon } from "./components/icons";

const DISCLAIMER =
  "MedLeaf Doctor gives general medical guidance, like a doctor would, but it is an AI and cannot examine you. It is not a substitute for a visit to a real doctor. In an emergency, call your local emergency number.";

// Chat key used when no medicine is selected: a general "ask the doctor" chat.
const GENERAL = "general";

// sessionStorage lives exactly as long as the browser tab: it survives a refresh
// and is wiped when the tab is closed, which is the behaviour we want for chats.
const STORE_KEY = "medleaf-session-v1";

function loadSaved() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
    if (!saved?.sessionId) return null;
    // A question that was still loading when the page closed can never finish.
    const chats = {};
    for (const [id, msgs] of Object.entries(saved.chats || {})) {
      chats[id] = msgs.map((m) =>
        m.status === "pending" ? { ...m, status: "error", error: "This question was interrupted. Please ask it again." } : m
      );
    }
    return { ...saved, chats };
  } catch {
    return null;
  }
}

export default function App() {
  const [saved] = useState(loadSaved);
  const [sessionId] = useState(() => saved?.sessionId || crypto.randomUUID());
  const [health, setHealth] = useState(null);
  const [medicines, setMedicines] = useState(() => saved?.medicines || []);
  const [chats, setChats] = useState(() => ({ [GENERAL]: [], ...(saved?.chats || {}) })); // { [doc_id]: messages[] }
  const [activeId, setActiveId] = useState(() => saved?.activeId || null);
  const [transcribing, setTranscribing] = useState(false);
  const [notice, setNotice] = useState("");
  const speech = useSpeech();
  const { speak, stop: stopSpeech } = speech;

  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: "offline" }));
  }, []);

  // Save everything on each change so a refresh restores all the chats.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ sessionId, medicines, chats, activeId }));
    } catch {
      /* storage full or blocked: the app still works, chats just won't survive a refresh */
    }
  }, [sessionId, medicines, chats, activeId]);

  const activeMedicine = medicines.find((m) => m.doc_id === activeId) || null;
  const chatKey = activeId || GENERAL;
  const messages = chats[chatKey] || [];

  // Only touch a chat that still exists (its medicine may have been removed while the answer was loading).
  const patchMessage = (docId, id, patch) =>
    setChats((c) =>
      c[docId] ? { ...c, [docId]: c[docId].map((m) => (m.id === id ? { ...m, ...patch } : m)) } : c
    );

  const selectChat = (docId) => {
    if (docId === activeRef.current) return;
    stopSpeech();
    setNotice("");
    setActiveId(docId);
  };

  const addMedicine = (m) => {
    setMedicines((ms) => [...ms, m]);
    setChats((c) => ({ ...c, [m.doc_id]: [] }));
    setActiveId(m.doc_id); // each new medicine opens its own, empty chat
    stopSpeech();
    setNotice("");
  };

  const removeMedicine = (m) => {
    api.removeDocument(sessionId, m.doc_id).catch(() => { });
    stopSpeech();
    const remaining = medicines.filter((x) => x.doc_id !== m.doc_id);
    setMedicines(remaining);
    setChats((c) => {
      const { [m.doc_id]: _gone, ...rest } = c;
      return rest;
    });
    if (activeRef.current === m.doc_id) setActiveId(remaining[0]?.doc_id || null);
  };

  const clearConversation = () => {
    stopSpeech();
    setChats((c) => ({ ...c, [chatKey]: [] }));
    setNotice("");
  };

  // ---- ask (RAG) + speak ---------------------------------------------------
  const ask = useCallback(
    async (text, viaVoice = false, forDocId = null, sttMs = null) => {
      const docId = forDocId || activeRef.current || GENERAL; // the chat this question belongs to
      const question = (text || "").trim();
      if (!(docId in chatsRef.current)) {
        setNotice("That medicine was removed, so the question was not sent.");
        return;
      }
      if (!question) {
        setNotice("I didn't catch a question. Tap the microphone and try again, or type it.");
        return;
      }
      setNotice("");
      stopSpeech();
      const id = crypto.randomUUID();
      const history = (chatsRef.current[docId] || [])
        .filter((m) => m.status === "done")
        .slice(-4)
        .map((m) => ({ question: m.question, answer: m.answer }));
      setChats((c) =>
        docId in c ? { ...c, [docId]: [...c[docId], { id, question, viaVoice, sttMs, startedAt: Date.now(), status: "pending" }] } : c
      );
      try {
        const t0 = performance.now();
        const res = await api.ask(sessionId, question, history, docId === GENERAL ? null : docId);
        patchMessage(docId, id, { status: "done", ...res, latencyMs: Math.round(performance.now() - t0) });
        if (activeRef.current === docId) speak(id, res.answer); // only read aloud if you're still in that chat
      } catch (err) {
        const lost = /find a medicine first/i.test(err.message);
        patchMessage(docId, id, {
          status: "error",
          error: lost
            ? "The server no longer has this medicine's information (it may have been restarted). Remove the medicine from the list and add it again."
            : err.message,
        });
      }
    },
    [sessionId, speak, stopSpeech]
  );

  // ---- voice -> Whisper -> ask --------------------------------------------
  const recordDocRef = useRef(null); // the chat that was open when recording started
  const handleRecorded = useCallback(
    async (blob) => {
      const docId = recordDocRef.current || activeRef.current || GENERAL; // decide the chat BEFORE the slow transcription
      recordDocRef.current = null;
      setTranscribing(true);
      setNotice("");
      let text;
      const sttStart = performance.now();
      try {
        ({ text } = await api.transcribe(blob));
      } catch (err) {
        setNotice(err.message);
        return;
      } finally {
        setTranscribing(false);
      }
      await ask(text, true, docId, Math.round(performance.now() - sttStart));
    },
    [ask]
  );

  const recorder = useRecorder({ onStop: handleRecorded, onError: setNotice });

  const toggleMic = () => {
    if (recorder.recording) recorder.stop();
    else {
      stopSpeech();
      setNotice("");
      recordDocRef.current = activeRef.current || GENERAL;
      recorder.start();
    }
  };

  const canAsk = true; // doctor mode: you can always ask, with or without a medicine
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
            activeId={activeId}
            onSelect={selectChat}
            onLoaded={addMedicine}
            onRemove={removeMedicine}
          />
          <div>
            <ChatTabs medicines={medicines} activeId={activeId} chats={chats} onSelect={selectChat} />
            <Conversation
              key={activeId || GENERAL}
              title={activeMedicine ? medicineName(activeMedicine) : ""}
              hasMedicine={Boolean(activeMedicine)}
              messages={messages}
              speech={speech}
              canAsk={canAsk}
              onAsk={ask}
              onClear={clearConversation}
            />
            <MicDock
              state={micState}
              canAsk={canAsk}
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