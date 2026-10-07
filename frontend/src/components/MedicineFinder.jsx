import { useRef, useState } from "react";
import { api } from "../api";
import { useRecorder } from "../hooks/useRecorder";
import { CheckIcon, CloseIcon, MicIcon, SendIcon, Spinner, StopIcon, UploadIcon } from "./icons";

const BUSY_TEXT = {
    reading: "Reading the text on the photo",
    transcribing: "Turning your voice into text",
    identifying: "Working out which medicine this is",
    loading: "Getting the official information",
};

export default function MedicineFinder({ sessionId, medicines, onLoaded, onRemove }) {
    const [text, setText] = useState("");
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [detected, setDetected] = useState(null);
    const [ingredientsText, setIngredientsText] = useState("");
    const photoRef = useRef(null);

    const identify = async (raw) => {
        const query = (raw || "").trim();
        if (!query) {
            setError("I didn't catch a medicine name. Try again, or type it.");
            setBusy("");
            return;
        }
        setError("");
        setDetected(null);
        setBusy("identifying");
        try {
            const res = await api.identify(query);
            if (!res.found) {
                setError("I couldn't tell which medicine this is. Try typing the name, or use a clearer photo of the box.");
            } else {
                setDetected(res);
                setIngredientsText(res.ingredients.join(", "));
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy("");
        }
    };

    const handlePhoto = async (e) => {
        const file = e.target.files?.[0];
        if (photoRef.current) photoRef.current.value = "";
        if (!file) return;
        setError("");
        setDetected(null);
        setBusy("reading");
        let boxText = "";
        try {
            const res = await api.extractImage(file);
            boxText = res.pages.map((p) => p.text).join("\n");
        } catch (err) {
            setError(err.message);
            setBusy("");
            return;
        }
        if (!boxText.trim()) {
            setError("I couldn't read any text on that photo. Try a clearer, closer photo of the box.");
            setBusy("");
            return;
        }
        await identify(boxText);
    };

    const handleRecorded = async (blob) => {
        setError("");
        setDetected(null);
        setBusy("transcribing");
        let spoken = "";
        try {
            ({ text: spoken } = await api.transcribe(blob));
        } catch (err) {
            setError(err.message);
            setBusy("");
            return;
        }
        setText(spoken);
        await identify(spoken);
    };

    const recorder = useRecorder({ onStop: handleRecorded, onError: setError });

    const confirm = async () => {
        const ingredients = ingredientsText.split(/[,+;]/).map((s) => s.trim()).filter(Boolean);
        if (!ingredients.length) {
            setError("Enter at least one active ingredient.");
            return;
        }
        setError("");
        setBusy("loading");
        try {
            const res = await api.loadMedicine(sessionId, ingredients);
            if (!res.found) {
                setError(`I couldn't find official information for ${ingredients.join(", ")}. Try the generic name, for example "paracetamol".`);
            } else {
                onLoaded({ ...res, brand: detected?.brand || null });
                setDetected(null);
                setText("");
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy("");
        }
    };

    const submit = (e) => {
        e.preventDefault();
        identify(text);
    };

    const locked = !!busy || recorder.recording;

    return (
        <section aria-labelledby="finder-heading" className="rounded-3xl glass-panel p-5 transition-all">
            <h2 id="finder-heading" className="font-display text-lg font-semibold text-pine">Find a medicine</h2>
            <p className="mt-1 text-sm text-muted">Take a photo of the box or wrapper, say the name, or type it.</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <label
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-medium text-pine focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-fern ${locked ? "pointer-events-none opacity-60" : "hover:bg-mint/50"
                        }`}
                >
                    <input
                        ref={photoRef}
                        type="file"
                        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                        className="sr-only"
                        disabled={locked}
                        onChange={handlePhoto}
                    />
                    <UploadIcon width={18} height={18} /> Photo
                </label>
                <button
                    type="button"
                    onClick={recorder.recording ? recorder.stop : recorder.start}
                    disabled={!!busy && !recorder.recording}
                    aria-pressed={recorder.recording}
                    className={`flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-medium disabled:opacity-60 ${recorder.recording ? "bg-fern text-white" : "text-pine hover:bg-mint/50"
                        }`}
                >
                    {recorder.recording ? <StopIcon width={18} height={18} /> : <MicIcon width={18} height={18} />}
                    {recorder.recording ? "Stop" : "Say the name"}
                </button>
            </div>

            <form onSubmit={submit} className="mt-2 flex gap-2">
                <label className="sr-only" htmlFor="medicine-name">Type a medicine name</label>
                <input
                    id="medicine-name"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={locked}
                    maxLength={200}
                    placeholder="Or type, e.g. Dolo 650"
                    className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-muted disabled:opacity-60"
                />
                <button
                    type="submit"
                    disabled={!text.trim() || locked}
                    className="flex items-center gap-1.5 rounded-xl bg-pine px-3 text-sm font-medium text-white hover:bg-pine-soft disabled:bg-line disabled:text-muted"
                >
                    Find <SendIcon width={14} height={14} />
                </button>
            </form>

            {recorder.recording && <p className="mt-3 text-sm font-medium text-ink" role="status">Listening. Tap Stop when you're done.</p>}
            {busy && (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
                    <Spinner /> {BUSY_TEXT[busy]}
                </p>
            )}
            {error && (
                <p role="alert" className="mt-3 rounded-lg border border-alarm-edge bg-alarm-bg px-3 py-2 text-sm text-alarm-text">{error}</p>
            )}

            {detected && !busy && (
                <div className="mt-4 rounded-xl border border-fern bg-mint/40 p-4">
                    <p className="text-sm text-muted">I think this is:</p>
                    <p className="mt-0.5 font-semibold text-ink">
                        {detected.brand || detected.ingredients.join(", ")}
                        {detected.strength ? ` (${detected.strength})` : ""}
                    </p>
                    {detected.confidence !== "high" && (
                        <p className="mt-1 text-sm text-alarm-text">I'm not fully sure. Please check the ingredient below.</p>
                    )}
                    <label htmlFor="ingredients" className="mt-3 block text-sm font-medium text-ink">Active ingredient(s)</label>
                    <input
                        id="ingredients"
                        value={ingredientsText}
                        onChange={(e) => setIngredientsText(e.target.value)}
                        maxLength={200}
                        className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                    />
                    <p className="mt-1 text-xs text-muted">Fix it if it's wrong. Separate several ingredients with commas.</p>
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            onClick={confirm}
                            className="flex items-center gap-1.5 rounded-xl bg-pine px-4 py-2 text-sm font-medium text-white hover:bg-pine-soft"
                        >
                            <CheckIcon width={16} height={16} /> Yes, get information
                        </button>
                        <button
                            type="button"
                            onClick={() => setDetected(null)}
                            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-white"
                        >
                            Not right
                        </button>
                    </div>
                </div>
            )}

            {medicines.length > 0 && (
                <ul className="mt-4 space-y-3">
                    {medicines.map((m) => (
                        <li key={m.doc_id} className="flex items-start gap-3 rounded-xl border border-line p-3">
                            <div className="min-w-0 flex-1 text-sm">
                                <p className="truncate font-medium text-ink" title={m.brand || m.ingredients.join(", ")}>
                                    {m.brand || m.ingredients.join(", ")}
                                </p>
                                <p className="text-muted">Active: {m.ingredients.join(", ")}</p>
                                <p className="mt-1 flex items-center gap-1.5 font-medium text-pine">
                                    <CheckIcon width={16} height={16} /> Official label loaded
                                </p>
                                {m.source_url && (
                                    <a href={m.source_url} target="_blank" rel="noreferrer" className="text-xs text-fern underline">
                                        View the official label
                                    </a>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => onRemove(m)}
                                aria-label={`Remove ${m.brand || m.ingredients.join(", ")}`}
                                className="rounded-lg p-1.5 text-muted hover:bg-mint hover:text-pine"
                            >
                                <CloseIcon width={18} height={18} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}