"""Fetch the official US drug label (openFDA, from DailyMed) for an active ingredient."""
import re

import httpx

API = "https://api.fda.gov/drug/label.json"

# International (INN) names -> the US names openFDA uses.
US_NAMES = {
    "paracetamol": "acetaminophen",
    "salbutamol": "albuterol",
    "adrenaline": "epinephrine",
    "noradrenaline": "norepinephrine",
    "pethidine": "meperidine",
    "frusemide": "furosemide",
    "lignocaine": "lidocaine",
    "rifampicin": "rifampin",
    "glibenclamide": "glyburide",
    "amoxycillin": "amoxicillin",
    "cetirizine hydrochloride": "cetirizine",
    "pantoprazole sodium": "pantoprazole",
}

# openFDA field -> heading shown to the user
SECTIONS = [
    ("purpose", "Purpose"),
    ("indications_and_usage", "Uses"),
    ("dosage_and_administration", "Dosage and directions"),
    ("contraindications", "Contraindications"),
    ("do_not_use", "Do not use"),
    ("warnings", "Warnings"),
    ("warnings_and_cautions", "Warnings and precautions"),
    ("precautions", "Precautions"),
    ("ask_doctor", "Ask a doctor before use"),
    ("ask_doctor_or_pharmacist", "Ask a doctor or pharmacist before use"),
    ("when_using", "When using this product"),
    ("stop_use", "Stop use and ask a doctor if"),
    ("pregnancy_or_breast_feeding", "Pregnancy or breast-feeding"),
    ("pregnancy", "Pregnancy"),
    ("adverse_reactions", "Side effects"),
    ("drug_interactions", "Drug interactions"),
    ("overdosage", "Overdose"),
    ("storage_and_handling", "Storage"),
    ("how_supplied", "How supplied and storage"),
    ("other_information", "Other information"),
    ("keep_out_of_reach_of_children", "Keep out of reach of children"),
    ("pediatric_use", "Use in children"),
    ("geriatric_use", "Use in older adults"),
    ("description", "Description"),
]
MAX_SECTION_CHARS = 3000
MAX_TOTAL_CHARS = 20000


class LabelError(Exception):
    pass


def _clean(value) -> str:
    if isinstance(value, list):
        value = " ".join(str(v) for v in value)
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _search(names: list[str]) -> list[dict]:
    query = " AND ".join(f'openfda.generic_name:"{n}"' for n in names)
    try:
        resp = httpx.get(API, params={"search": query, "limit": 10}, timeout=20.0)
    except httpx.HTTPError as exc:
        raise LabelError("Could not reach the official drug database. Check your internet connection.") from exc
    if resp.status_code == 404:  # openFDA uses 404 for "no matches"
        return []
    if resp.status_code != 200:
        raise LabelError(f"The drug database returned an error ({resp.status_code}). Try again in a moment.")
    return resp.json().get("results", [])


def _pick(results: list[dict], wanted: set[str]) -> dict:
    """Prefer the label whose active ingredients match best, then the one with the most text."""

    def score(r: dict):
        subs = {s.lower() for s in r.get("openfda", {}).get("substance_name", [])}
        extra = len(subs - wanted) if subs else 5
        size = sum(len(_clean(r.get(k))) for k, _ in SECTIONS)
        return (extra, -size)

    return min(results, key=score)


def fetch_label(ingredients: list[str]) -> dict:
    names = [re.sub(r"[^a-z0-9 \-]", "", i.lower()).strip() for i in ingredients]
    names = [n for n in names if n][:5]
    not_found = {"found": False, "ingredients": names}
    if not names:
        return not_found

    candidates = [[US_NAMES.get(n, n) for n in names]]
    if candidates[0] != names:
        candidates.append(names)

    results, wanted = [], set()
    for cand in candidates:
        results = _search(cand)
        if results:
            wanted = set(cand)
            break
    if not results:
        return not_found

    label = _pick(results, wanted)
    sections: dict[str, str] = {}
    total = 0
    for key, title in SECTIONS:
        text = _clean(label.get(key))[:MAX_SECTION_CHARS]
        if not text or total + len(text) > MAX_TOTAL_CHARS:
            continue
        sections[title] = text
        total += len(text)
    if not sections:
        return not_found

    fda = label.get("openfda", {})
    set_id = (fda.get("spl_set_id") or [None])[0]
    return {
        "found": True,
        "ingredients": names,
        "label_name": (fda.get("brand_name") or fda.get("generic_name") or [None])[0],
        "manufacturer": (fda.get("manufacturer_name") or [None])[0],
        "effective": label.get("effective_time"),
        "source_url": f"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={set_id}" if set_id else None,
        "sections": sections,
    }