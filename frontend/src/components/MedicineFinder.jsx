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

const siteName = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
};

export default function MedicineFinder({ sessionId, medicines, activeId, onSelect, onLoaded, onRemove }) {
    const [text, setText] = useState("");
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [detected, setDetected] = useState(null);
    const [nameText, setNameText] = useState("");
    const [brandText, setBrandText] = useState("");
    const [strengthText, setStrengthText] = useState("");
    const [formText, setFormText] = useState("");
    const [ingredientsText, setIngredientsText] = useState("");
    const [candidates, setCandidates] = useState([]);
    const [webNote, setWebNote] = useState("");
    const [webSources, setWebSources] = useState([]);
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
        setCandidates([]);
        setWebNote("");
        setWebSources([]);
        setBusy("identifying");
        try {
            const res = await api.identify(query);
            setCandidates(res.candidates || []);
            setWebNote(res.web_note || "");
            setWebSources(res.web_sources || []);
            if (!res.found) {
                // Pre-fill fields with user's query so they can edit directly
                setDetected({ found: true, confidence: "low" });
                setNameText(query);
                setBrandText(query);
                setStrengthText("");
                setFormText("");
                setIngredientsText("");
            } else {
                setDetected(res);
                setNameText(res.display_name || res.brand || query);
                setBrandText(res.brand || "");
                setStrengthText(res.strength || "");
                setFormText(res.form || "");
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
        const ingredients = ingredientsText.split(/\s*(?:,|;|\+|&|\/|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean);
        if (!ingredients.length && !brandText.trim() && !nameText.trim()) {
            setError("Enter at least the medicine name or active ingredient.");
            return;
        }
        setError("");
        setBusy("loading");
        try {
            const payload = {
                ingredients,
                brand: brandText.trim() || null,
                strength: strengthText.trim() || null,
                form: formText.trim() || null,
                name: nameText.trim() || null,
            };
            const res = await api.loadMedicine(sessionId, payload);
            if (!res.found) {
                setError(`I couldn't find official information for ${nameText || ingredients.join(", ")}. Try checking the active ingredient name (e.g. "azelaic acid" or "paracetamol").`);
            } else {
                onLoaded({ ...res, brand: brandText || detected?.brand || null, web_sources: webSources });
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
            <p className="mt-1 text-sm text-muted">Take a photo of the box/tube, say the name, or type it.</p>

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
                <label className="sr-only" htmlFor="medicine-name">Type a medicine or cream name</label>
                <input
                    id="medicine-name"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={locked}
                    maxLength={200}
                    placeholder="e.g. Azelaic acid cream, Risedone 10 mg"
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
                    <p className="text-sm font-medium text-pine">Confirm Medicine Details</p>

                    {webNote && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-snug text-amber-900">{webNote}</p>
                    )}
                    {webSources.length > 0 && (
                        <p className="mt-1.5 text-xs text-muted">
                            Ingredients checked on:{" "}
                            {webSources.map((u, i) => (
                                <span key={u}>
                                    {i > 0 && ", "}
                                    <a href={u} target="_blank" rel="noreferrer" className="text-fern underline">{siteName(u)}</a>
                                </span>
                            ))}
                        </p>
                    )}
                    {candidates.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                            <p className="text-xs font-semibold text-pine">Which one is on your pack?</p>
                            {candidates.map((c) => (
                                <button
                                    key={c.brand + c.ingredients.join()}
                                    type="button"
                                    onClick={() => {
                                        setNameText(c.brand);
                                        setBrandText(c.brand);
                                        setIngredientsText(c.ingredients.join(", "));
                                        setCandidates([]);
                                        setWebNote(`You chose ${c.brand} (${c.ingredients.join(", ")}).`);
                                    }}
                                    className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-left text-sm text-ink hover:bg-mint/50"
                                >
                                    <span className="font-semibold">{c.brand}</span>
                                    <span className="text-muted"> &mdash; {c.ingredients.join(", ")}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="mt-3 space-y-2.5">
                        <div>
                            <label htmlFor="med-name" className="block text-xs font-semibold text-pine">Medicine / Cream Name</label>
                            <input
                                id="med-name"
                                value={nameText}
                                onChange={(e) => setNameText(e.target.value)}
                                maxLength={200}
                                placeholder="e.g. Azelaic Acid Cream, Risedone Plus"
                                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label htmlFor="med-strength" className="block text-xs font-semibold text-pine">Strength / Variant</label>
                                <input
                                    id="med-strength"
                                    value={strengthText}
                                    onChange={(e) => setStrengthText(e.target.value)}
                                    maxLength={100}
                                    placeholder="e.g. 5 mg, 10 mg, Plus"
                                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                                />
                            </div>

                            <div>
                                <label htmlFor="med-form" className="block text-xs font-semibold text-pine">Form (Cream/Gel/Tablet)</label>
                                <input
                                    id="med-form"
                                    value={formText}
                                    onChange={(e) => setFormText(e.target.value)}
                                    maxLength={100}
                                    placeholder="e.g. cream, gel, tablet"
                                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="ingredients" className="block text-xs font-semibold text-pine">Active Ingredient(s)</label>
                            <input
                                id="ingredients"
                                value={ingredientsText}
                                onChange={(e) => setIngredientsText(e.target.value)}
                                maxLength={200}
                                placeholder="e.g. azelaic acid, risperidone"
                                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                            />
                        </div>
                    </div>

                    <p className="mt-2 text-xs text-muted">You can edit any field above before fetching official information.</p>

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
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {medicines.length > 0 && (
                <ul className="mt-4 space-y-3">
                    {medicines.map((m) => (
                        <li key={m.doc_id} className={`flex items-start gap-3 rounded-xl border p-3 ${m.doc_id === activeId ? "border-pine bg-mint/50 ring-1 ring-pine" : "border-line"}`}>
                            <div className="min-w-0 flex-1 cursor-pointer text-sm" onClick={() => onSelect?.(m.doc_id)} title="Open this medicine's chat">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="font-semibold text-ink" title={m.display_name || m.brand || m.ingredients.join(", ")}>
                                        {m.display_name || m.brand || m.ingredients.join(", ")}
                                    </p>
                                    {m.form && !((m.display_name || m.brand || "").toLowerCase().includes(m.form.toLowerCase())) && (
                                        <span className="rounded-md bg-mint px-2 py-0.5 text-xs font-medium text-pine capitalize">
                                            {m.form}
                                        </span>
                                    )}
                                    {m.strength && !((m.display_name || m.brand || "").toLowerCase().includes(m.strength.toLowerCase())) && (
                                        <span className="rounded-md bg-fern/10 px-2 py-0.5 text-xs font-medium text-fern">
                                            {m.strength}
                                        </span>
                                    )}
                                </div>
                                {m.ingredients?.length > 0 && (
                                    <p className="mt-0.5 text-muted">Active: {m.ingredients.join(", ")}</p>
                                )}
                                <p className="mt-1 flex items-center gap-1.5 font-medium text-pine">
                                    <CheckIcon width={16} height={16} /> {m.labels?.length ? "Official label loaded" : "Brand information loaded"}
                                </p>
                                {m.web_pages?.length > 0 && (
                                    <p className="mt-1.5 text-xs text-muted">
                                        Brand information from (not official labels):{" "}
                                        {m.web_pages.map((w, i) => (
                                            <span key={w.url}>
                                                {i > 0 && ", "}
                                                <a href={w.url} target="_blank" rel="noreferrer" className="text-fern underline">{w.site}</a>
                                            </span>
                                        ))}
                                    </p>
                                )}
                                {m.web_sources?.length > 0 && (
                                    <p className="mt-1.5 text-xs text-muted">
                                        Ingredients checked on:{" "}
                                        {m.web_sources.map((u, i) => (
                                            <span key={u}>
                                                {i > 0 && ", "}
                                                <a href={u} target="_blank" rel="noreferrer" className="text-fern underline">{siteName(u)}</a>
                                            </span>
                                        ))}
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => onRemove(m)}
                                aria-label={`Remove ${m.display_name || m.ingredients.join(", ")}`}
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