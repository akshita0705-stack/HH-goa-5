"""Fixed safety copy and lightweight question screening."""
import re

DISCLAIMER = (
    "This application provides information from official medicine labels only. "
    "It does not provide medical diagnosis or personalized medical advice. "
    "Always follow your doctor or pharmacist's instructions."
)
NOT_FOUND = "This label doesn't cover that. Try asking about its uses, directions, warnings, or when to stop using it."
EMERGENCY_NOTE = (
    "If you have severe or emergency symptoms, contact a qualified healthcare "
    "professional or your local emergency service right away."
)
DOSE_CHANGE_NOTE = (
    "I can't advise on starting, stopping or changing a medicine or its dose. "
    "Please ask your doctor or pharmacist."
)

_EMERGENCY = re.compile(
    r"chest pain|can'?t breathe|cannot breathe|(difficulty|trouble|hard to) breath|overdos|"
    r"took too (many|much)|swollen (face|lips|tongue|throat)|swelling of (the )?(face|lips|tongue|throat)|"
    r"anaphyla|severe allergic|unconscious|passed out|seizure|suicid|kill myself|"
    r"heavy bleeding|bleeding heavily|stroke|heart attack|poison",
    re.I,
)
_DOSE_CHANGE = re.compile(
    r"\b(should|can|could|may|do|shall) i\b.*\b(stop|skip|start|increase|decrease|double|reduce|halve|quit|"
    r"take more|take less|change)\b|\b(stop|skip|double|increase|reduce) (taking|my)\b",
    re.I,
)


def needs_emergency_note(question: str) -> bool:
    return bool(_EMERGENCY.search(question))


def asks_dose_change(question: str) -> bool:
    return bool(_DOSE_CHANGE.search(question))
