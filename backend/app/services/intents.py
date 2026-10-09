"""Map a patient's question to the label sections most likely to answer it.

Section names must match the headings produced in drug_label.SECTIONS.
"""
import re

INTENTS = [
    (r"child|kid|infant|baby|toddler|pediatric|paediatric|minor", ["Use in children", "Dosage and directions", "Warnings"]),
    (r"pregnan|breast|nursing|lactat|expecting|conceiv", ["Pregnancy or breast-feeding", "Pregnancy", "Breast-feeding", "Warnings and precautions"]),
    (r"elderly|older adult|old age|senior|geriatric", ["Use in older adults", "Dosage and directions"]),
    (r"stor(e|age|ing)|refrigerat|temperature|expir|shelf", ["Storage", "How supplied and storage", "Other information"]),
    (r"side.?effects?|adverse|reaction|unwanted|burn|sting|itch|rash|irritat|nausea|dizz|vomit|harm|risk", ["Side effects", "Stop use and ask a doctor if", "Warnings", "Warnings and precautions", "Patient information"]),
    (r"interact|together with|combine|mix|alcohol|other medicines?|other drugs?", ["Drug interactions", "Warnings", "Ask a doctor or pharmacist before use"]),
    (r"overdos|too much|too many|extra dose|accident", ["Overdose"]),
    (r"how (much|often|many|long)|how (do|should|can) i (use|take|apply)|\bdos(e|es|age)\b|direction|apply|take it|times a day|per day|daily|frequency|missed dose", ["Dosage and directions", "Instructions for use", "Forms and strengths", "Patient information"]),
    (r"\bstop\b|discontinue|quit|when (to|should) i see|see a doctor|call a doctor", ["Stop use and ask a doctor if", "Warnings", "Ask a doctor before use"]),
    (r"warn|caution|precaution|\bsafe|avoid|not use|shouldn'?t|should not|who (can|should)|allerg|contraindic|dangerous", ["Warnings", "Warnings and precautions", "Do not use", "Contraindications", "Precautions", "Boxed warning", "Ask a doctor before use"]),
    (r"how does|how it works|work\b|mechanism|action", ["How it works", "Description"]),
        (r"used for|\buses\b|what is (this|it)|indicat|treat|purpose|what does (this|it) do|help(s)? with|for what|which patients?|who (generally |usually |typically |normally |should |can )?(use|take|need)s?|for whom|suitable for|prescribed for|why (is|do|would)", ["Uses", "Purpose", "Patient information", "Description"]),
    (r"strength|available in|comes in|tablet size|how supplied|packag", ["Forms and strengths", "How supplied and storage"]),
]


def sections_for(question: str) -> list[str]:
    q = (question or "").lower()
    found: list[str] = []
    for pattern, sections in INTENTS:
        if re.search(pattern, q):
            for s in sections:
                if s not in found:
                    found.append(s)
    return found