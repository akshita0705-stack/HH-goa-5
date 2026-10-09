# MedLeaf Voice (MLV)

A voice-first AI doctor and medicine label assistant. Ask any health question by voice or text and get a clear, consultation-style answer from **MedLeaf Doctor**. You can also take a photo of a medicine box or type its name: the doctor then uses that medicine's **official label as its most trusted source**, shows the exact label lines it relied on, and reads the answer aloud.

```
[ Photo of box / Voice / Text ] ──> Medicine Identification & OCR (Tesseract / LLM)
                                          │
                                          ▼
                         DailyMed / OpenFDA Official Label Fetch (optional)
                                          │
                                          ▼
                       Sentence-Aware Chunking & ChromaDB Vectorstore
                                          │
 [ Voice Question ] ──> Whisper STT ──> RAG Retrieval (if a medicine is loaded) ──> Doctor-style Generation (LLM)
                                                                 │
                                                                 ▼
                                                  Label Sources (when used) + Speech Synthesis
```

---

## ✨ Features

- 🩺 **Ask the Doctor (new)**: Ask any health question, with or without a medicine loaded. Answers are written the way a caring doctor speaks in a consultation: a direct answer first, the most likely explanations, practical home care and over-the-counter guidance, red-flag symptoms that need urgent care, and sometimes one follow-up question. Replies are in plain language and in the language you used.
- 📷 **Instant Medicine Identification**: Take a photo of a medicine box/wrapper, say its name out loud, or type it (e.g. *Dolo 650*, *Paracetamol*). MedLeaf Voice extracts the active ingredient using Tesseract OCR and LLM entity recognition.
- 💊 **Official Drug Label Retrieval**: Automatically fetches verified, up-to-date drug labels from official registries (FDA / DailyMed).
- 🎙️ **Voice & Text Interaction**: Ask questions using your microphone or keyboard. Voice input is transcribed in real-time with local `faster-whisper`.
- 🛡️ **Label-Backed & Safe Answers**: When a medicine is loaded, its official label is treated as the most reliable source. Doses, ages, and warnings follow the label exactly, and the label lines used are shown under the answer. If no label is loaded, the doctor answers from general medical knowledge and no sources are shown. A safety screen adds an emergency note for serious symptoms, and for a loaded medicine it adds a note when you ask about changing a dose. The doctor will not give a definite diagnosis and will not tell you to start, stop, or change a prescription dose on your own.
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

---

## 🩺 How Doctor Mode Works

| Situation | What happens |
|---|---|
| No medicine selected | You are in the general **Ask the Doctor** chat. The question is answered from general medical knowledge. |
| Medicine selected | Relevant label sections are retrieved and given to the doctor as the most trusted facts. General medical knowledge is added around them. If the two differ, the label wins and the doctor says so. |
| Serious symptoms mentioned | An emergency note is added to the answer. |
| Asking to start, stop, or change a dose (medicine selected) | A note tells you to confirm with your doctor or pharmacist. |

The doctor's behaviour is controlled by the `DOCTOR_SYSTEM` prompt in `backend/app/services/llm.py`. Edit it to change the tone, length, or how cautious the advice is.

> MedLeaf Doctor is an AI. It cannot examine you and does not replace a visit to a real doctor.

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
| `/api/ask` | `POST` | Doctor-style answer. `doc_id` is optional: send it to ground the answer in that medicine's label, or omit it for a general health question |
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
│   │       ├── llm.py           # Doctor-style answer generator (DOCTOR_SYSTEM prompt)
│   │       └── safety.py        # Question screening & medical notes
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── public/
│   │   └── medicine_bg.jpg      # Medicine & herbal backdrop image
│   ├── src/
│   │   ├── App.jsx              # Main app state & workflow (includes general doctor chat)
│   │   ├── api.js               # API service client
│   │   ├── components/
│   │   │   ├── Header.jsx       # Centered header with MLV logo
│   │   │   ├── MedicineFinder.jsx # Photo, voice & text medicine lookup
│   │   │   ├── Conversation.jsx # Chat history, starter questions & TTS controls
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

MedLeaf Doctor gives general medical guidance for informational purposes only. It is an AI and cannot examine you, diagnose you, or replace a real doctor or pharmacist. Always consult a qualified healthcare professional before making any medical decision. In an emergency, call your local emergency number right away.