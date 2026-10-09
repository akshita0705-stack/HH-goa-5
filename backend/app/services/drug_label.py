"""Find the best official US drug label (openFDA / DailyMed) for a medicine and shape it for Q&A.

Matching is done on ingredient, dosage form (cream / gel / tablet ...), brand and strength.
Whenever the label we found differs from what the user asked for, a plain-language note says so.
"""
import re
from functools import lru_cache

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
    "ciclosporin": "cyclosporine",
    "thyroxine": "levothyroxine",
    "risedronic acid": "risedronate",
    "colecalciferol": "cholecalciferol",
    "vitamin d3": "cholecalciferol",
    "povidone iodine": "povidone-iodine",
}

# Salt / hydrate words that differ between countries ("pantoprazole sodium" -> "pantoprazole").
SALT_WORDS = {
    "sodium", "potassium", "calcium", "magnesium", "hydrochloride", "hcl", "sulfate", "sulphate",
    "maleate", "mesylate", "mesilate", "besylate", "tartrate", "succinate", "phosphate", "acetate",
    "citrate", "bromide", "hydrobromide", "nitrate", "fumarate", "dihydrate", "monohydrate", "anhydrous",
}

# Words people type -> canonical dosage form.
FORM_ALIASES = {
    "cream": "cream", "creme": "cream", "gel": "gel", "ointment": "ointment", "oint": "ointment",
    "lotion": "lotion", "foam": "foam", "paste": "paste", "shampoo": "shampoo", "spray": "spray",
    "tablet": "tablet", "tablets": "tablet", "tab": "tablet", "capsule": "capsule", "capsules": "capsule",
    "cap": "capsule", "syrup": "syrup", "suspension": "suspension", "solution": "solution",
    "drops": "drops", "drop": "drops", "injection": "injection", "powder": "powder", "sachet": "powder",
    "patch": "patch", "suppository": "suppository", "emulsion": "emulsion", "inhaler": "inhalation",
    "liquid": "solution",
}
TOPICAL_FORMS = {"cream", "gel", "ointment", "lotion", "foam", "paste", "shampoo"}
ORAL_FORMS = {"tablet", "capsule", "syrup", "suspension", "powder"}
FORM_WORDS = sorted(set(FORM_ALIASES.values()))

# (openFDA field, heading shown to the user, max characters kept). Order = importance.
SECTIONS = [
    ("purpose", "Purpose", 800),
    ("indications_and_usage", "Uses", 3500),
    ("information_for_patients", "Patient information", 5000),
    ("spl_patient_package_insert", "Patient information", 5000),
    ("spl_medguide", "Medication guide", 6000),
    ("boxed_warning", "Boxed warning", 2500),
    ("dosage_and_administration", "Dosage and directions", 6000),
    ("instructions_for_use", "Instructions for use", 3000),
    ("dosage_forms_and_strengths", "Forms and strengths", 1500),
    ("contraindications", "Contraindications", 3000),
    ("do_not_use", "Do not use", 2000),
    ("warnings", "Warnings", 5000),
    ("warnings_and_cautions", "Warnings and precautions", 6000),
    ("precautions", "Precautions", 5000),
    ("ask_doctor", "Ask a doctor before use", 1500),
    ("ask_doctor_or_pharmacist", "Ask a doctor or pharmacist before use", 1500),
    ("when_using", "When using this product", 1500),
    ("stop_use", "Stop use and ask a doctor if", 1500),
    ("pregnancy_or_breast_feeding", "Pregnancy or breast-feeding", 1500),
    ("pregnancy", "Pregnancy", 2500),
    ("lactation", "Breast-feeding", 2500),
    ("nursing_mothers", "Breast-feeding", 2500),
    ("adverse_reactions", "Side effects", 8000),
    ("drug_interactions", "Drug interactions", 4000),
    ("overdosage", "Overdose", 2000),
    ("storage_and_handling", "Storage", 1500),
    ("how_supplied", "How supplied and storage", 2000),
    ("other_information", "Other information", 1500),
    ("keep_out_of_reach_of_children", "Keep out of reach of children", 400),
    ("pediatric_use", "Use in children", 2500),
    ("geriatric_use", "Use in older adults", 2500),
    ("mechanism_of_action", "How it works", 2500),
    ("description", "Description", 2000),
]
SECTION_TITLES = {t for _, t, _ in SECTIONS}
MAX_TOTAL_CHARS = 45000
SEARCH_LIMIT = 12


class LabelError(Exception):
    pass


# ----------------------------------------------------------------------------- helpers
def _clean(value) -> str:
    if isinstance(value, list):
        value = " ".join(str(v) for v in value)
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return re.sub(r"\[\s*see [^\]]*\]", "", text, flags=re.I).strip()  # drop "[see Warnings (5.1)]"


def canon_form(form) -> str | None:
    if not form:
        return None
    for word in re.findall(r"[a-z]+", str(form).lower()):
        if word in FORM_ALIASES:
            return FORM_ALIASES[word]
    return None


def _strength_pattern(strength):
    """Regex that finds a numeric strength like '10 mg' or '15%' in label text, or None for words like 'Plus'."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g|ml|iu|%|units?)", str(strength or "").lower())
    if not m:
        return None
    num, unit = m.group(1), m.group(2)
    unit = "mcg|µg|ug" if unit in ("mcg", "µg", "ug") else re.escape(unit)
    tail = r"(?![a-z])" if unit != "%" else ""
    return re.compile(rf"(?<![\d.]){re.escape(num)}\s*(?:{unit}){tail}", re.I)


def _name_variants(name: str) -> list[str]:
    mapped = US_NAMES.get(name, name)
    base = " ".join(w for w in mapped.split() if w not in SALT_WORDS) or mapped
    out = []
    for v in (mapped, base):
        if v and v not in out:
            out.append(v)
    return out


def _name_sets(names: list[str]) -> list[list[str]]:
    sets = [
        [_name_variants(n)[0] for n in names],
        [_name_variants(n)[-1] for n in names],
        list(names),
    ]
    out = []
    for s in sets:
        if s and s not in out:
            out.append(s)
    return out


def _label_names(r: dict) -> set[str]:
    fda = r.get("openfda", {})
    return {n.lower() for n in (fda.get("substance_name") or []) + (fda.get("generic_name") or [])}


def _same(a: str, b: str) -> bool:
    if len(a) <= 3 or len(b) <= 3:
        return False
    if a in b or b in a:
        return True
    wa, wb = a.split()[0], b.split()[0]
    return len(wa) >= 8 and len(wb) >= 8 and wa[:8] == wb[:8]  # risedronate ~ risedronic


def _has_content(r: dict) -> bool:
    """A usable label says what the medicine is for or how to take it (bulk-ingredient entries don't)."""
    return any(_clean(r.get(k)) for k in ("indications_and_usage", "purpose", "dosage_and_administration"))


def _blob(r: dict, keys: list[str], limit: int = 2500) -> str:
    return " ".join(_clean(r.get(k))[:limit].lower() for k in keys)


def _form_text(r: dict) -> str:
    fda = r.get("openfda", {})
    names = " ".join((fda.get("brand_name") or []) + (fda.get("generic_name") or [])).lower()
    keys = ["spl_product_data_elements", "how_supplied", "package_label_principal_display_panel",
            "dosage_forms_and_strengths", "description"]
    return names + " " + _blob(r, keys, 1500)


def _forms_in(r: dict) -> list[str]:
    text = _form_text(r)
    return [f for f in FORM_WORDS if re.search(rf"\b{f}s?\b", text)]


def _strength_text(r: dict) -> str:
    fda = r.get("openfda", {})
    names = " ".join(fda.get("brand_name") or []).lower()
    keys = ["spl_product_data_elements", "how_supplied", "package_label_principal_display_panel",
            "dosage_forms_and_strengths", "description", "dosage_and_administration"]
    return names + " " + _blob(r, keys, 4000)


def _strengths_listed(r: dict) -> list[str]:
    text = _blob(r, ["dosage_forms_and_strengths", "how_supplied", "spl_product_data_elements"], 3000)
    found = []
    for m in re.finditer(r"(?<![\d.])(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|%|iu)(?![a-z])", text):
        s = f"{m.group(1)} {m.group(2)}" if m.group(2) != "%" else f"{m.group(1)}%"
        if s not in found:
            found.append(s)
    return found[:8]


# ----------------------------------------------------------------------------- searching
@lru_cache(maxsize=64)
def _fetch(query: str, limit: int) -> tuple:
    try:
        resp = httpx.get(API, params={"search": query, "limit": limit}, timeout=25.0)
    except httpx.HTTPError as exc:
        raise LabelError("Could not reach the official drug database. Check your internet connection.") from exc
    if resp.status_code == 429:
        raise LabelError("The drug database is busy right now. Wait a moment and try again.")
    if resp.status_code != 200:  # 404 = no matches; anything else: treat as "nothing here"
        return ()
    return tuple(resp.json().get("results", []))


def _gen(names: list[str]) -> str:
    return " AND ".join(f'openfda.generic_name:"{n}"' for n in names)


def _staged_search(names: list[str], form: str | None, brand: str | None) -> list[dict]:
    """Try the most specific query first, then relax it. First query with results wins."""
    base = _gen(names)
    queries = []
    if brand:
        queries.append(f'openfda.brand_name:"{brand}" AND {base}')
    if form:
        queries.append(f'{base} AND spl_product_data_elements:"{form}"')
        route = "TOPICAL" if form in TOPICAL_FORMS else "ORAL" if form in ORAL_FORMS else None
        if route:
            queries.append(f'{base} AND openfda.route:"{route}"')
    queries.append(base)
    for q in queries:
        res = _fetch(q, SEARCH_LIMIT)
        if res:
            return list(res)
    return []


# ----------------------------------------------------------------------------- choosing
def _pick(results, wanted, form, strength, brand):
    """Return (best label, flags). Lower score is better."""
    spat = _strength_pattern(strength)
    wb = (brand or "").lower().strip()

    def evaluate(r):
        names = _label_names(r)
        hits = sum(1 for w in wanted if any(_same(w, n) for n in names))
        extra = sum(1 for n in names if not any(_same(w, n) for w in wanted))
        forms = _forms_in(r)
        form_ok = bool(form) and form in forms
        strength_ok = bool(spat) and bool(spat.search(_strength_text(r)))
        fda = r.get("openfda", {})
        brand_ok = bool(wb) and any(wb in b.lower() or b.lower() in wb for b in fda.get("brand_name", []))
        has_patient = any(r.get(k) for k in ("information_for_patients", "spl_patient_package_insert", "spl_medguide"))
        size = sum(len(_clean(r.get(k))) for k, _, _ in SECTIONS)
        product_type = " ".join(fda.get("product_type") or []).lower()

        brand_text = " ".join(fda.get("brand_name") or []).lower()
        score = (len(wanted) - hits) * 100 + extra * 40
        if re.search(r"child|kid|baby|infant|junior|pediatric", brand_text) and not re.search(r"child|kid|baby|infant|junior|pediatric", wb):
            score += 60
        if "powder" in forms and form != "powder":
            score += 60
        # A delayed/extended-release label is a different product (different dose and timing).
        # Only accept it when the user's own words mention it.
        rel_text = (brand_text + " " + _blob(r, ["spl_product_data_elements", "description", "dosage_forms_and_strengths"], 1500))
        wants_release = re.search(r"delayed|extended|\bdr\b|\bxr\b|\ber\b|\bsr\b|modified|controlled", wb + " " + (strength or "").lower())
        if re.search(r"delayed[- ]release|extended[- ]release|modified[- ]release", rel_text) and not wants_release:
            score += 120
        if "bulk" in product_type:
            score += 500
        if form:
            score += -150 if form_ok else 80
        if spat:
            score += -60 if strength_ok else 0
        if brand_ok:
            score -= 100
        score -= 25 if has_patient else 0
        score -= min(size, 30000) / 600.0
        if "human" not in product_type and product_type:
            score += 300
        return score, {
            "ing_hits": hits, "extra": extra, "form_ok": form_ok, "strength_ok": strength_ok,
            "brand_ok": brand_ok, "forms": forms,
        }

    usable = [r for r in results if _has_content(r)]
    if not usable:
        return None, None
    scored = [(evaluate(r), r) for r in usable]
    (score, flags), best = min(scored, key=lambda x: x[0][0])
    return best, flags


def _find_one(names, brand, form, strength):
    """Best single label for these ingredients (all together), or (None, None)."""
    if names:
        for cand in _name_sets(names):
            results = _staged_search(cand, form, brand)
            if not results:
                continue
            label, flags = _pick(results, set(cand), form, strength, brand)
            # reject labels for a different product (missing an ingredient, or with extra active ingredients)
            if label and flags["ing_hits"] == len(cand) and flags["extra"] == 0:
                return label, flags
        return None, None
    # No ingredients known: try what was typed as a US brand, then as a generic name.
    if brand:
        for field in ("brand_name", "generic_name"):
            results = _fetch(f'openfda.{field}:"{brand}"', SEARCH_LIMIT)
            if results:
                label, flags = _pick(list(results), set(), form, strength, brand)
                if label:
                    return label, flags
    return None, None


# ----------------------------------------------------------------------------- building
def _title_of(label: dict) -> str:
    fda = label.get("openfda", {})
    name = (fda.get("brand_name") or fda.get("generic_name") or ["Unnamed product"])[0].title()
    generic = (fda.get("generic_name") or [""])[0].lower()
    forms = _forms_in(label)
    parts = [name]
    if generic and generic != name.lower():
        parts.append(f"({generic})")
    if forms:
        parts.append(forms[0])
    return " ".join(parts)


def _build(label: dict, group: str | None, flags: dict) -> dict:
    sections: dict[str, str] = {}
    total = 0
    for key, title, cap in SECTIONS:
        text = _clean(label.get(key))[:cap]
        if not text:
            continue
        if total + len(text) > MAX_TOTAL_CHARS:
            continue
        sections[title] = (sections[title] + " " + text) if title in sections else text
        total += len(text)
    fda = label.get("openfda", {})
    set_id = (fda.get("spl_set_id") or [None])[0]
    return {
        "group": group,
        "title": _title_of(label),
        "label_name": (fda.get("brand_name") or fda.get("generic_name") or [None])[0],
        "manufacturer": (fda.get("manufacturer_name") or [None])[0],
        "effective": label.get("effective_time"),
        "source_url": f"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={set_id}" if set_id else None,
        "forms": flags["forms"],
        "strengths": _strengths_listed(label),
        "sections": sections,
        "_flags": flags,
    }


def _notes_for(built: dict, names: list[str], brand, form, strength) -> list[str]:
    flags = built["_flags"]
    who = ", ".join(names) if names else "this medicine"
    notes = []
    if form and not flags["form_ok"]:
        have = ", ".join(built["forms"][:2]) or "different"
        notes.append(f"I couldn't find an official {form} label for {who}. This is the {have} label, so check that it fits your product.")
    spat = _strength_pattern(strength)
    if spat and not flags["strength_ok"]:
        listed = ", ".join(built["strengths"])
        tail = f" It lists: {listed}." if listed else ""
        notes.append(f"This official label doesn't mention {strength}.{tail} Dose answers follow what the label says.")
    elif strength and not spat:
        notes.append(f"\u201c{strength}\u201d isn't something the label can confirm. This label covers {who} only.")
    if brand and not flags["brand_ok"]:
        us = (built["label_name"] or "").strip()
        same = us.lower() in {n.lower() for n in names} or any(us.lower() in n.lower() or n.lower() in us.lower() for n in names)
        extra = "" if same or not us else f" (sold in the US as {us})"
        notes.append(
            f"{brand} is a brand sold outside the US. Its medicine is {who}, so the answers come from the official US label "
            f"for {who}{extra}. Doses and strengths on your pack may differ, so follow your pack and your doctor."
        )
    return notes


VARIANT_WORDS = re.compile(r"\b(plus|forte|combi|combo|duo|m|ds|am|cv|d3|ca)\b", re.I)


def _variant_note(brand, names) -> str | None:
    """'Plus', 'Forte' etc. usually mean extra ingredients. If we only know one, say so plainly."""
    if brand and len(names) == 1 and VARIANT_WORDS.search(brand):
        return (
            f"\u201c{brand}\u201d may contain more than {names[0]} (a \u201cPlus\u201d product often adds calcium or "
            f"vitamins). This label covers {names[0]} only. Please check the ingredients printed on your pack."
        )
    return None


_SPLIT = re.compile(r"\s*(?:,|;|\+|&|/|\band\b|\bwith\b|\bplus\b)\s*", re.I)
_STRENGTH_IN_NAME = re.compile(r"\(?\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|g|gm|ml|iu|%)\b\)?", re.I)
_FILLER = re.compile(r"\b(tablets?|tabs?|capsules?|caps?|ip|bp|usp|i\.p\.)\b", re.I)
NAME_FIXES = {"benzhexol": "trihexyphenidyl", "benzhexol hydrochloride": "trihexyphenidyl hydrochloride"}


def _clean_names(ingredients) -> list[str]:
    """Accepts messy typing such as 'Risperidone (3 mg) and Trihexyphenidyl HCl (2 mg)'."""
    names: list[str] = []
    for item in ingredients or []:
        for part in _SPLIT.split(str(item)):
            part = re.sub(r"\([^)]*\)", " ", part)          # (3 mg), (as hydrochloride)
            part = _STRENGTH_IN_NAME.sub(" ", part)           # 3 mg
            part = _FILLER.sub(" ", part)
            part = re.sub(r"[^a-z0-9 \-]", " ", part.lower())
            part = re.sub(r"\s+", " ", part).strip()
            part = NAME_FIXES.get(part, part)
            if part and part not in names:
                names.append(part)
    return names[:5]


def fetch_labels(ingredients=None, brand=None, strength=None, form=None, display_name=None) -> dict:
    names = _clean_names(ingredients)
    brand_c = re.sub(r"[^A-Za-z0-9 \-]", "", brand or "").strip() or None
    form_c = canon_form(form)
    strength_c = (strength or "").strip() or None
    out = {"found": False, "ingredients": names, "labels": [], "notes": []}
    if not names and not brand_c:
        return out

    built_list = []
    label, flags = _find_one(names, brand_c, form_c, strength_c)
    if label:
        built = _build(label, None, flags)
        built_list.append(built)
        out["notes"] += _notes_for(built, names, brand_c, form_c, strength_c)
        vn = _variant_note(brand_c, names)
        if vn:
            out["notes"].append(vn)
    elif len(names) > 1:
        for n in names:
            lab, fl = _find_one([n], None, form_c, None)
            if lab:
                built_list.append(_build(lab, n, fl))
        if built_list:
            found_for = ", ".join(b["group"] for b in built_list)
            out["notes"].append(
                "No single official label covers this combination, so I loaded a separate official label "
                f"for each ingredient ({found_for}). Answers say which ingredient each statement is about."
            )
            missing = [n for n in names if n not in {b["group"] for b in built_list}]
            if missing:
                out["notes"].append(
                    f"I couldn't find a standalone official label for {', '.join(missing)}, so answers don't cover it."
                )
    built_list = [b for b in built_list if b["sections"]]
    out["brand_not_in_us"] = bool(brand_c) and not any(b["_flags"]["brand_ok"] for b in built_list)
    if not built_list:
        return out

    for b in built_list:
        b.pop("_flags", None)
    out.update(
        found=True,
        labels=built_list,
        brand=brand_c,
        strength=strength_c,
        form=form_c,
        display_name=display_name or brand_c or ", ".join(n.capitalize() for n in names) or built_list[0]["title"],
    )
    return out


def fetch_label(ingredients: list[str]) -> dict:
    """Simple single-label lookup used by the /api/label test endpoint."""
    res = fetch_labels(ingredients=ingredients)
    if not res["found"]:
        return {"found": False, "ingredients": res["ingredients"]}
    first = res["labels"][0]
    return {
        "found": True,
        "ingredients": res["ingredients"],
        "label_name": first["label_name"],
        "manufacturer": first["manufacturer"],
        "effective": first["effective"],
        "source_url": first["source_url"],
        "sections": first["sections"],
    }