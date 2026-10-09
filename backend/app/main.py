import json
import logging
import re
import tempfile
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app import config
from app.services import chunking, drug_label, extract, indian_sources, intents, llm, medicine, safety, stt, vectorstore

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("medleaf")

SESSION_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")
DOC_RE = re.compile(r"^[0-9a-f]{32}$")
KINDS = {".pdf": "pdf", ".jpg": "image", ".jpeg": "image", ".png": "image"}
MAGIC = {".pdf": b"%PDF", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff", ".png": b"\x89PNG\r\n\x1a\n"}
AUDIO_EXT = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".mp4", "audio/wav": ".wav",
             "audio/x-wav": ".wav", "audio/mpeg": ".mp3"}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm the embedding model so the first upload isn't slow.
    threading.Thread(target=vectorstore.get_model, daemon=True).start()
    yield


app = FastAPI(title="MedLeaf Voice API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"]
)


# ----------------------------------------------------------------- helpers
def _session(session_id: str) -> str:
    if not SESSION_RE.match(session_id or ""):
        raise HTTPException(400, "Invalid session id.")
    return session_id


def _doc_dir(session_id: str, doc_id: str) -> Path:
    if not DOC_RE.match(doc_id or ""):
        raise HTTPException(400, "Invalid document id.")
    return config.UPLOAD_DIR / vectorstore.session_key(session_id) / doc_id


def _validate_upload(filename: str, data: bytes) -> tuple[str, str]:
    ext = Path(filename or "").suffix.lower()
    if ext not in KINDS:
        raise ValueError("Unsupported file type. Upload a PDF, JPG, JPEG or PNG.")
    if not data:
        raise ValueError("The file is empty.")
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise ValueError(f"The file is larger than {config.MAX_UPLOAD_MB} MB.")
    head = data[:1024]
    ok = MAGIC[ext] in head if ext == ".pdf" else head.startswith(MAGIC[ext])
    if not ok:
        raise ValueError("The file contents do not match its extension. It may be damaged.")
    return ext, KINDS[ext]


def _tesseract_ok() -> bool:
    try:
        import pytesseract

        if config.TESSERACT_CMD:
            pytesseract.pytesseract.tesseract_cmd = config.TESSERACT_CMD
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _snippet(text: str, limit: int = 300) -> str:
    flat = re.sub(r"\s+", " ", text).strip()
    return flat if len(flat) <= limit else flat[:limit].rsplit(" ", 1)[0] + "..."


def _extract_endpoint(file: UploadFile, kind: str) -> dict:
    data = file.file.read()
    try:
        ext, actual = _validate_upload(file.filename, data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if actual != kind:
        raise HTTPException(400, f"This endpoint accepts {'PDF files' if kind == 'pdf' else 'JPG or PNG images'} only.")
    try:
        pages = extract.extract_pages(data, kind)
    except extract.ExtractionError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"filename": file.filename, "pages": pages, "characters": sum(len(p["text"]) for p in pages)}


# --------------------------------------------------------------- endpoints
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "llm_configured": bool(config.GROQ_API_KEY),
        "tesseract": _tesseract_ok(),
        "llm_model": config.LLM_MODEL,
    }


@app.post("/api/upload")
def upload(session_id: str = Form(...), files: list[UploadFile] = File(...)):
    """Validate and store files. Returns one result per file, in the order sent."""
    _session(session_id)
    results = []
    for f in files:
        data = f.file.read()
        try:
            ext, kind = _validate_upload(f.filename, data)
        except ValueError as exc:
            results.append({"filename": f.filename, "error": str(exc)})
            continue
        doc_id = uuid.uuid4().hex
        folder = _doc_dir(session_id, doc_id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"file{ext}").write_bytes(data)
        (folder / "meta.json").write_text(json.dumps({"filename": f.filename, "kind": kind, "ext": ext}))
        results.append({"filename": f.filename, "doc_id": doc_id, "kind": kind, "size": len(data)})
    return {"results": results}


@app.post("/api/extract/pdf")
def extract_pdf_endpoint(file: UploadFile = File(...)):
    """Stateless helper: return the text PyMuPDF extracts from a PDF, page by page."""
    return _extract_endpoint(file, "pdf")


@app.post("/api/extract/image")
def extract_image_endpoint(file: UploadFile = File(...)):
    """Stateless helper: return the text Tesseract reads from an image."""
    return _extract_endpoint(file, "image")


class ProcessRequest(BaseModel):
    session_id: str
    doc_ids: list[str] = Field(min_length=1)


@app.post("/api/process")
def process(req: ProcessRequest):
    """Extract text/OCR, clean, chunk, embed, and store uploaded documents in ChromaDB."""
    _session(req.session_id)
    results = []
    for doc_id in req.doc_ids:
        folder = _doc_dir(req.session_id, doc_id)
        try:
            meta = json.loads((folder / "meta.json").read_text())
            data = (folder / f"file{meta['ext']}").read_bytes()
        except (OSError, ValueError, KeyError):
            results.append({"doc_id": doc_id, "status": "error", "error": "Uploaded file not found. Upload it again."})
            continue
        try:
            pages = extract.extract_pages(data, meta["kind"])
            for p in pages:
                p["chunks"] = chunking.chunk_text(p["text"])
            n = vectorstore.add_chunks(req.session_id, doc_id, meta["filename"], meta["kind"], pages)
            if n == 0:
                raise extract.ExtractionError("The text in this file was too short to use.")
            results.append({"doc_id": doc_id, "status": "ready", "chunks": n, "pages": len(pages)})
        except extract.ExtractionError as exc:
            results.append({"doc_id": doc_id, "status": "error", "error": str(exc)})
        except Exception:
            log.exception("Processing failed for %s", doc_id)
            results.append({"doc_id": doc_id, "status": "error",
                            "error": "Something went wrong while indexing this file. Try again."})
    return {"results": results, "total_chunks": vectorstore.count(req.session_id)}


@app.post("/api/transcribe")
def transcribe(audio: UploadFile = File(...)):
    """Speech-to-text with Whisper."""
    data = audio.file.read()
    if len(data) < 1000:
        raise HTTPException(422, "The recording was empty. Record a little longer and try again.")
    base_type = (audio.content_type or "").split(";")[0].strip().lower()
    suffix = AUDIO_EXT.get(base_type) or Path(audio.filename or "").suffix or ".webm"
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(data)
            tmp.flush()
            text = stt.transcribe(tmp.name)
    except Exception:
        log.exception("Transcription failed")
        raise HTTPException(500, "Could not transcribe the recording. Try again, or type your question.")
    if not text:
        raise HTTPException(422, "I couldn't hear a question. Speak closer to the microphone and try again.")
    return {"text": text}


class Turn(BaseModel):
    question: str
    answer: str


class AskRequest(BaseModel):
    session_id: str
    question: str
    history: list[Turn] = []
    doc_id: str | None = None  # the medicine this chat belongs to; searches only that label


@app.post("/api/ask")
def ask(req: AskRequest):
    """RAG: retrieve label passages, answer strictly from them, return sources."""
    _session(req.session_id)
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "Please ask a question.")
    if len(question) > 500:
        raise HTTPException(400, "That question is too long. Keep it under 500 characters.")
    has_label = False
    if req.doc_id:
        _doc_dir(req.session_id, req.doc_id)  # validates the id format
        try:
            has_label = vectorstore.count(req.session_id, req.doc_id) > 0
        except Exception:
            log.exception("Vector store unavailable")  # fall back to a general doctor answer

    history = [t.model_dump() for t in req.history[-4:]]
    try:
        standalone = llm.rewrite_question(question, history)
        passages: list[dict] = []
        if has_label:
            try:
                wanted = intents.sections_for(standalone)
                targeted = (
                    vectorstore.query(req.session_id, standalone, 4, req.doc_id, sections=wanted) if wanted else []
                )
                general = vectorstore.query(req.session_id, standalone, 3 if targeted else config.TOP_K, req.doc_id)
            except Exception:
                log.exception("Retrieval failed")
                targeted, general = [], []
            seen_text = set()
            for h, is_targeted in [(h, True) for h in targeted] + [(h, False) for h in general]:
                if h["text"] in seen_text or (not is_targeted and h["distance"] > config.MAX_DISTANCE):
                    continue
                seen_text.add(h["text"])
                passages.append(h)
            passages = passages[:7]
        # Doctor mode: always answer. Label passages are used as facts when they exist.
        result = llm.doctor_answer(question, standalone, passages, history)
    except llm.MissingKeyError as exc:
        raise HTTPException(503, str(exc)) from exc
    except llm.LLMError as exc:
        raise HTTPException(502, str(exc)) from exc

    found = result["found"]
    answer = result["answer"].replace("*", "").strip() or safety.NOT_FOUND

    sources: list[dict] = []
    if found:
        seen = set()
        for ev in result["evidence"]:
            idx = ev.get("passage")
            if not isinstance(idx, int) or not 1 <= idx <= len(passages):
                continue
            p = passages[idx - 1]
            quote = ev.get("quote", "")
            excerpt = _snippet(quote) if llm.quote_in(quote, p["text"]) else _snippet(p["text"])
            if (idx, excerpt) not in seen:
                seen.add((idx, excerpt))
                sources.append(_source(p, excerpt))
        if not sources and result.get("used_label") and passages:  # label used but no usable quote: show closest passages
            sources = [_source(p, _snippet(p["text"])) for p in passages[:2]]
    sources = sources[:4]

    emergency = safety.needs_emergency_note(question)
    if emergency:
        answer += " " + safety.EMERGENCY_NOTE
    if has_label and safety.asks_dose_change(question):
        answer += " " + safety.DOSE_CHANGE_NOTE

    return {"answer": answer, "found": found, "emergency": emergency,
            "standalone_question": standalone, "sources": sources}


def _source(p: dict, excerpt: str) -> dict:
    section = p.get("section") or ""
    if section:
        who = f"{p['group']} \u2014 " if p.get("group") else ""
        label = f"{p['source']} \u2014 {who}{section}"
    else:
        label = f"{p['source']}, page {p['page']}" if p["kind"] == "pdf" else f"{p['source']} (image)"
    return {"label": label, "source": p["source"], "page": p["page"], "kind": p["kind"], "excerpt": excerpt,
            "url": p.get("url") or None}


@app.delete("/api/documents/{session_id}/{doc_id}")
def remove_document(session_id: str, doc_id: str):
    _session(session_id)
    _doc_dir(session_id, doc_id)  # validates id
    vectorstore.delete_doc(session_id, doc_id)
    return {"ok": True}


@app.delete("/api/session/{session_id}")
def clear_session(session_id: str):
    _session(session_id)
    vectorstore.delete_session(session_id)
    return {"ok": True}


class IdentifyRequest(BaseModel):
    text: str


@app.post("/api/identify")
def identify_medicine(req: IdentifyRequest):
    """Work out the medicine name and active ingredient from typed, spoken or OCR text."""
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Tell me the medicine name or upload a photo of it.")
    try:
        return medicine.identify(text)
    except llm.MissingKeyError as exc:
        raise HTTPException(503, str(exc)) from exc
    except llm.LLMError as exc:
        raise HTTPException(502, str(exc)) from exc


class LabelRequest(BaseModel):
    ingredients: list[str] = Field(default=[], max_length=5)
    brand: str | None = None
    strength: str | None = None
    form: str | None = None
    name: str | None = None


@app.post("/api/label")
def get_label(req: LabelRequest):
    """Fetch the official drug label for the given active ingredient(s)."""
    try:
        return drug_label.fetch_label(
            ingredients=req.ingredients,
            brand=req.brand,
            strength=req.strength,
            form=req.form,
            display_name=req.name,
        )
    except drug_label.LabelError as exc:
        raise HTTPException(502, str(exc)) from exc


class LoadMedicineRequest(BaseModel):
    session_id: str
    ingredients: list[str] = Field(default=[], max_length=5)
    brand: str | None = None
    strength: str | None = None
    form: str | None = None
    name: str | None = None


@app.post("/api/medicine/load")
def load_medicine(req: LoadMedicineRequest):
    """Fetch the best official label(s) for the medicine and store them so /api/ask can answer from them."""
    _session(req.session_id)
    try:
        res = drug_label.fetch_labels(
            ingredients=req.ingredients,
            brand=req.brand,
            strength=req.strength,
            form=req.form,
            display_name=req.name,
        )
    except drug_label.LabelError as exc:
        raise HTTPException(502, str(exc)) from exc
    # Brands sold outside the US are not in the FDA database: also read the brand's own page on pharmacy sites.
    web_pages = []
    if (req.brand or "").strip() and res.get("brand_not_in_us", True):
        try:
            web_pages = indian_sources.fetch_pages(req.brand.strip(), res["ingredients"])
        except Exception:
            log.exception("Indian brand lookup failed")
    if not res["found"] and not web_pages:
        return {"found": False, "ingredients": res["ingredients"], "notes": res["notes"]}
    if web_pages:
        res["notes"].append(
            "Information for this brand also comes from pharmacy websites (" + ", ".join(p["site"] for p in web_pages) +
            "). They are not official labels, so check with your doctor or pharmacist."
        )

    display_title = req.name or res.get("display_name") or (req.brand or "").strip()
    labels = res.get("labels", [])
    note = f"The user's product: {display_title}"
    if res.get("form"):
        note += f", form {res['form']}"
    if res.get("strength"):
        note += f", strength {res['strength']}"
    if labels:
        note += ". Official label used: " + "; ".join(l["title"] for l in labels) + "."
    if res["notes"]:
        note += " " + " ".join(res["notes"])

    pages = []
    n = 0
    for label in labels:
        prefix = f"{label['group'].title()} \u2014 " if label["group"] else ""
        for title, text in label["sections"].items():
            chunks = [f"{prefix}{title}: {c}" for c in chunking.chunk_text(text)]
            if chunks:
                n += 1
                pages.append({"page": n, "chunks": chunks, "section": title, "group": label["group"] or ""})

    for wp in web_pages:
        chunks = chunking.chunk_text(wp["text"])
        if chunks:
            n += 1
            pages.append({"page": n, "chunks": chunks, "section": "Brand information", "group": "",
                          "source": f"Web page: {wp['site']}", "url": wp["url"]})

    if len(labels) == 1:
        source = f"Official FDA label: {labels[0]['title']}"
    elif labels:
        source = "Official FDA labels: " + ", ".join(l["group"] or l["title"] for l in labels)
    else:
        source = "Web page: " + ", ".join(p["site"] for p in web_pages)
    doc_id = uuid.uuid4().hex
    try:
        total = vectorstore.add_chunks(req.session_id, doc_id, source, "pdf", pages, note=note[:900])
    except Exception:
        log.exception("Storing the drug label failed")
        raise HTTPException(500, "Could not store the medicine information. Try again.")
    if total == 0:
        return {"found": False, "ingredients": res["ingredients"], "notes": res["notes"]}
    return {
        "found": True,
        "doc_id": doc_id,
        "chunks": total,
        "source": source,
        "display_name": display_title,
        "brand": res.get("brand"),
        "strength": res.get("strength"),
        "form": res.get("form"),
        "label_name": labels[0]["label_name"] if labels else None,
        "manufacturer": labels[0]["manufacturer"] if labels else None,
        "source_url": labels[0]["source_url"] if labels else None,
        "labels": [{"title": l["title"], "url": l["source_url"]} for l in labels],
        "web_pages": [{"site": p["site"], "url": p["url"]} for p in web_pages],
        "notes": res["notes"],
        "ingredients": res["ingredients"],
    }