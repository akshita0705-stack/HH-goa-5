"""Speech-to-text with Whisper (faster-whisper, CPU, int8)."""
import threading

from app import config

_lock = threading.Lock()
_model = None


def _load():
    global _model
    with _lock:
        if _model is None:
            from faster_whisper import WhisperModel

            _model = WhisperModel(config.WHISPER_MODEL, device="cpu", compute_type="int8")
        return _model


def transcribe(path: str) -> str:
    segments, _info = _load().transcribe(
        path, language=config.WHISPER_LANGUAGE or None, vad_filter=True, beam_size=1
    )
    return " ".join(s.text.strip() for s in segments).strip()
