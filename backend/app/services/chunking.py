import re
import textwrap


def chunk_text(text: str, max_chars: int = 800, overlap_units: int = 2) -> list[str]:
    """Split text into ~max_chars chunks on line/sentence boundaries with a small overlap."""
    units: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        for sentence in re.split(r"(?<=[.!?;:])\s+", line):
            if len(sentence) > max_chars:
                units.extend(textwrap.wrap(sentence, max_chars))
            elif sentence:
                units.append(sentence)

    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for unit in units:
        if current and size + len(unit) > max_chars:
            chunks.append("\n".join(current))
            current = current[-overlap_units:] if overlap_units else []
            size = sum(len(u) + 1 for u in current)
        current.append(unit)
        size += len(unit) + 1
    if current:
        chunks.append("\n".join(current))
    return [c for c in chunks if len(c) >= 20]
