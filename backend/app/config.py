import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _num(name: str, default, cast=int):
    try:
        return cast(os.getenv(name, default))
    except (TypeError, ValueError):
        return cast(default)


GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile").strip()

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "en").strip()

TESSERACT_CMD = os.getenv("TESSERACT_CMD", "").strip()
OCR_LANG = os.getenv("OCR_LANG", "eng")

DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
CHROMA_DIR = DATA_DIR / "chroma"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_MB = _num("MAX_UPLOAD_MB", 20)
TOP_K = _num("TOP_K", 5)
MAX_DISTANCE = _num("MAX_DISTANCE", 1.0, float)
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]