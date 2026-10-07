# MedLeaf Voice

A voice-first medicine leaflet reader. Upload a leaflet (PDF or photo), ask questions out loud, and get answers that come **only from your document**, with the exact source lines shown and the answer read aloud.

```
Upload PDF/image -> PyMuPDF text / Tesseract OCR -> clean + chunk -> sentence-transformers embeddings -> ChromaDB
Voice question -> Whisper -> retrieve top passages -> LLM answers strictly from them -> sources + SpeechSynthesis
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Python, FastAPI |
| PDF text | PyMuPDF (scanned pages fall back to OCR) |
| Image OCR | Tesseract via pytesseract |
| Embeddings / store | sentence-transformers (`all-MiniLM-L6-v2`) + ChromaDB |
| Speech-to-text | Whisper (`faster-whisper`, runs locally on CPU) |
| LLM | Anthropic API (key in environment variable) |
| Text-to-speech | Browser SpeechSynthesis |

## Prerequisites

- Python 3.10+ and Node.js 18+
- **Tesseract OCR** (only needed for photos and scanned PDFs; text PDFs work without it)
  - macOS: `brew install tesseract`
  - Ubuntu/Debian: `sudo apt install tesseract-ocr`
  - Windows: install from https://github.com/UB-Mannheim/tesseract/wiki, then set `TESSERACT_CMD` in `backend/.env`
- An Anthropic API key from https://console.anthropic.com/
- Chrome or Edge recommended (best microphone and speech support). Microphone access works on `localhost` without HTTPS.

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # Windows: copy .env.example .env
```

Open `backend/.env` and set `ANTHROPIC_API_KEY=...`.

Run it:

```bash
uvicorn app.main:app --reload --port 8000
```

The first start downloads the embedding model (~90 MB). The first voice question downloads the Whisper `base` model (~150 MB). After that everything is cached.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. In development Vite proxies `/api` to the backend on port 8000, so no extra configuration is needed. For a deployed build, copy `frontend/.env.example` to `frontend/.env`, set `VITE_API_BASE` to your backend URL, add that origin to `CORS_ORIGINS` in `backend/.env`, and run `npm run build`.

## Configuration (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Required for answers |
| `LLM_MODEL` | `claude-sonnet-5-5` | Any Claude model id your key can use |
| `WHISPER_MODEL` | `base` | `tiny` is faster, `small` is more accurate |
| `WHISPER_LANGUAGE` | `en` | Leave empty to auto-detect |
| `TESSERACT_CMD` | empty | Path to the tesseract binary if not on PATH |
| `OCR_LANG` | `eng` | Tesseract language pack |
| `TOP_K` | `5` | Passages retrieved per question |
| `MAX_DISTANCE` | `1.0` | Cosine-distance cut-off; lower is stricter |
| `MAX_UPLOAD_MB` | `20` | Per-file size limit |

To use a different LLM provider, only `backend/app/services/llm.py` needs to change (`_complete` is the single call site).

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Server, LLM key, and Tesseract status |
| POST | `/api/upload` | Validate and store files (`session_id`, `files[]`) |
| POST | `/api/extract/pdf` | Return PyMuPDF text per page (stateless helper) |
| POST | `/api/extract/image` | Return OCR text for an image (stateless helper) |
| POST | `/api/process` | Extract, clean, chunk, embed, and store in ChromaDB |
| POST | `/api/transcribe` | Whisper speech-to-text (`audio`) |
| POST | `/api/ask` | RAG answer with sources (`session_id`, `question`, `history`) |
| DELETE | `/api/documents/{session}/{doc}` | Remove one leaflet |
| DELETE | `/api/session/{session}` | Remove all leaflets for a session |

Interactive docs: http://localhost:8000/docs

## How answers stay grounded

1. Follow-ups ("What about children?") are rewritten into standalone questions using the last few turns, so retrieval works.
2. Only passages within `MAX_DISTANCE` are sent to the LLM. If none qualify, the app answers with the fixed sentence: *"I could not find this information in the uploaded medicine leaflet."* without calling the LLM.
3. The LLM is told to use only the numbered passages, to treat them as untrusted text, and to return JSON with the exact words it relied on.
4. Quoted evidence is checked against the passage text. If the quote isn't really in the passage, the UI shows the passage itself instead.
5. Questions that mention emergencies (chest pain, overdose, swelling of the face, and similar) get a visible warning and a spoken reminder to contact a healthcare professional or emergency service. Questions about starting, stopping, or changing a dose get a note to ask a doctor or pharmacist.

## Project structure

```
medleaf-voice/
  backend/
    app/
      main.py              FastAPI routes
      config.py            Environment settings
      services/
        extract.py         PyMuPDF + Tesseract + text cleaning
        chunking.py        Sentence-aware chunking
        vectorstore.py     Embeddings + ChromaDB
        stt.py             Whisper
        llm.py             Grounded generation
        safety.py          Disclaimer + question screening
    requirements.txt
    .env.example
  frontend/
    src/
      App.jsx              State and workflow
      api.js               REST client
      hooks/               useRecorder (mic), useSpeech (TTS)
      components/          Header, UploadPanel, Conversation, MicDock, icons
    package.json
    .env.example
```

## Troubleshooting

- **"Tesseract OCR isn't installed"** banner: install Tesseract (see Prerequisites) or set `TESSERACT_CMD`, then restart the backend.
- **"LLM API key is missing"** banner: set `ANTHROPIC_API_KEY` in `backend/.env` and restart.
- **No automatic voice playback**: some browsers block speech until you interact with the page. Press Play on the answer.
- **Microphone blocked**: click the lock icon in the address bar and allow the microphone. You can also type questions.
- **Poor OCR on photos**: use a straight-on, well-lit photo where the text fills the frame.
- **Reset everything**: stop the backend and delete `backend/data/`.

## Demo script

1. Drop in a leaflet PDF and watch it go from Uploading to Reading the text to Ready.
2. Tap the mic: "What side effects are listed?" The recognized question, answer, source excerpt, and spoken reply appear.
3. Follow up: "What about children?"
4. Ask something the leaflet doesn't cover to show the "could not find" response.

## Safety

This application provides information from the uploaded medicine leaflet only. It does not provide medical diagnosis or personalized medical advice. Always follow your doctor or pharmacist's instructions.
