# MedLeaf Voice (MLV)

A voice-first intelligent medicine leaflet & official drug label assistant. Take a photo of a medicine box, speak or type its name, ask questions out loud, and receive instant, grounded answers **sourced strictly from official medicine labels**, with exact line citations and spoken audio playback.

```
[ Photo of box / Voice / Text ] ──> Medicine Identification & OCR (Tesseract / LLM)
                                          │
                                          ▼
                         DailyMed / OpenFDA Official Label Fetch
                                          │
                                          ▼
                       Sentence-Aware Chunking & ChromaDB Vectorstore
                                          │
 [ Voice Question ] ──> Whisper STT ──> RAG Retrieval ──> Grounded Generation (LLM)
                                                                 │
                                                                 ▼
                                                  Exact Sources + Speech Synthesis
```

---

## ✨ Features

- 📷 **Instant Medicine Identification**: Take a photo of a medicine box/wrapper, say its name out loud, or type it (e.g. *Dolo 650*, *Paracetamol*). MedLeaf Voice extracts the active ingredient using Tesseract OCR and LLM entity recognition.
- 💊 **Official Drug Label Retrieval**: Automatically fetches verified, up-to-date drug labels from official registries (FDA / DailyMed).
- 🎙️ **Voice & Text Interaction**: Ask questions using your microphone or keyboard. Voice input is transcribed in real-time with local `faster-whisper`.
- 🛡️ **Grounded & Safe Answers**: Answers are generated strictly from indexed label sections. Built-in safety screen checks for emergency symptoms and dose modification risks.
- 🔊 **Text-to-Speech (TTS)**: Listens and speaks replies out loud with interactive Play, Replay, and Stop controls.
- 🎨 **Modern Aesthetic UI**: Includes a centered **MLV** logo emblem, glassmorphic frosted cards, radiant glowing mic controls, and a medical herbal backdrop.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS |
| **Backend** | Python 3.10+, FastAPI, Uvicorn |
| **OCR & Vision** | Tesseract OCR (`pytesseract`), PyMuPDF |
| **Embeddings & Vector Database** | `sentence-transformers` (`all-MiniLM-L6-v2`), ChromaDB |
| **Speech-to-Text (STT)** | `faster-whisper` (runs locally on CPU) |
| **LLM Provider** | Groq / Anthropic API (configured via `.env`) |
| **Text-to-Speech (TTS)** | Web SpeechSynthesis API |
| **Drug Label Data** | DailyMed / OpenFDA APIs |

---

## 📋 Prerequisites

- **Python**: 3.10 or higher
- **Node.js**: 18.x or higher
- **Tesseract OCR**: (Required for photo recognition)
  - **macOS**: `brew install tesseract`
  - **Ubuntu / Debian**: `sudo apt install tesseract-ocr`
  - **Windows**: Install from [UB-Mannheim Tesseract Wiki](https://github.com/UB-Mannheim/tesseract/wiki) and ensure `TESSERACT_CMD` is set in `backend/.env` if not in system PATH.
- **LLM API Key**: Groq or Anthropic API key.
- **Browser**: Google Chrome or Microsoft Edge recommended for full microphone and speech synthesis support.

---

## 🚀 Quick Start & Setup

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create environment configuration file
copy .env.example .env     # Windows
# cp .env.example .env     # macOS/Linux
```

Open `backend/.env` and configure your API key:
```env
GROQ_API_KEY=your_api_key_here
# or ANTHROPIC_API_KEY=your_key_here
```

Start the FastAPI server:
```bash
uvicorn app.main:app --reload --port 8000
```
> **Note**: On initial startup, the embedding model (~90 MB) and Whisper model (~150 MB) will be downloaded and cached locally.

---

### 2. Frontend Setup

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open your browser and navigate to **`http://localhost:5173`**.

---

## ⚙️ Configuration Options (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | empty | API key for LLM generation |
| `ANTHROPIC_API_KEY` | empty | Alternative LLM API key |
| `LLM_MODEL` | `llama-3.3-70b-versatile` | Model ID for question answering |
| `WHISPER_MODEL` | `base` | Speech recognition model size (`tiny`, `base`, `small`) |
| `WHISPER_LANGUAGE` | `en` | Speech language (leave blank for auto-detect) |
| `TESSERACT_CMD` | empty | Path to Tesseract binary if not on system PATH |
| `TOP_K` | `5` | Top passage chunks retrieved per question |
| `MAX_DISTANCE` | `1.0` | Cosine similarity cut-off threshold |
| `MAX_UPLOAD_MB` | `20` | File upload size limit |

---

## 📡 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Health check for backend, LLM, and Tesseract OCR status |
| `/api/identify` | `POST` | Identifies medicine brand & active ingredients from text/OCR |
| `/api/label` | `POST` | Fetches official drug label from DailyMed / OpenFDA |
| `/api/medicine/load` | `POST` | Loads, chunks, and indexes official drug label into ChromaDB |
| `/api/transcribe` | `POST` | Converts spoken audio recording into text via Whisper |
| `/api/ask` | `POST` | RAG endpoint answering questions using indexed label chunks |
| `/api/extract/image` | `POST` | Helper endpoint for image OCR extraction |
| `/api/extract/pdf` | `POST` | Helper endpoint for PDF text extraction |
| `/api/documents/{session}/{doc}` | `DELETE` | Removes a specific medicine document from session |
| `/api/session/{session}` | `DELETE` | Clears all data for a session |

Interactive API documentation is available at **`http://localhost:8000/docs`**.

---

## 📁 Project Structure

```
medleaf-voice/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI endpoints & lifecycle
│   │   ├── config.py            # Environment configurations
│   │   └── services/
│   │       ├── drug_label.py    # Official DailyMed/FDA label fetcher
│   │       ├── medicine.py      # Medicine identification service
│   │       ├── extract.py       # Tesseract OCR & PyMuPDF extraction
│   │       ├── chunking.py      # Sentence-aware document chunker
│   │       ├── vectorstore.py   # Sentence-Transformers & ChromaDB vector DB
│   │       ├── stt.py           # Whisper Speech-to-Text
│   │       ├── llm.py           # Grounded RAG answer generator
│   │       └── safety.py        # Question screening & medical notes
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── public/
│   │   └── medicine_bg.jpg      # Medicine & herbal backdrop image
│   ├── src/
│   │   ├── App.jsx              # Main app state & workflow
│   │   ├── api.js               # API service client
│   │   ├── components/
│   │   │   ├── Header.jsx       # Centered header with MLV logo
│   │   │   ├── MedicineFinder.jsx # Photo, voice & text medicine lookup
│   │   │   ├── Conversation.jsx # Interactive chat history & TTS controls
│   │   │   ├── MicDock.jsx      # Glowing microphone dock
│   │   │   └── icons.jsx        # SVG icons & MLV logo emblem
│   │   ├── hooks/               # Custom hooks (mic recorder, TTS speech)
│   │   └── index.css            # Tailwind & glassmorphism custom CSS
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## ⚠️ Disclaimer

This application provides information extracted from official medicine labels for informational purposes only. It does not provide medical diagnosis or personalized treatment advice. Always consult your doctor or pharmacist before making any medical decisions.
