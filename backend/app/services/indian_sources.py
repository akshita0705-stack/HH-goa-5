"""Brand information for medicines sold in India (and elsewhere) that are not in the US label database.

Finds the brand's own page on well-known pharmacy / drug-information websites, reads the page text,
and returns it so answers can be grounded in it. Pages are shown to the user under their real website
name; they are NOT official labels.
"""
import re
from functools import lru_cache

import httpx

from app.services import composition_lookup as cl

INDIAN_DOMAINS = [
    "apollopharmacy.in", "1mg.com", "pharmeasy.in", "netmeds.com", "medindia.net",
    "medplusmart.com", "microlabsltd.com",
]
MAX_PAGES = 2
MAX_CHARS = 9000
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; MedLeafBot/1.0; educational project)",
    "Accept-Language": "en-IN,en;q=0.9",
}


def _page_text(html: str) -> str:
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "form", "svg", "iframe"]):
            tag.decompose()
        text = soup.get_text(" ")
    except ImportError:
        text = re.sub(r"(?is)<(script|style|noscript).*?</\1>", " ", html)
        text = re.sub(r"(?s)<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _base_name(ingredient: str) -> str:
    """'trihexyphenidyl hydrochloride' -> 'trihexyphenidyl'"""
    words = [w for w in re.findall(r"[a-z]+", ingredient.lower()) if w not in {
        "hydrochloride", "hcl", "sodium", "potassium", "calcium", "oxalate", "maleate", "sulphate", "sulfate",
        "mesylate", "tartrate", "succinate", "acetate", "phosphate", "citrate", "bromide"}]
    return words[0] if words else ""


@lru_cache(maxsize=64)
def _get(url: str) -> str:
    try:
        r = httpx.get(url, headers=HEADERS, timeout=15.0, follow_redirects=True)
    except httpx.HTTPError:
        return ""
    return _page_text(r.text) if r.status_code == 200 else ""


def fetch_pages(brand: str, ingredients: list[str]) -> list[dict]:
    """Up to 2 pages [{site, url, text}] for this exact brand, each mentioning every active ingredient."""
    brand_key = cl._key(brand)
    if len(brand_key) < 4:
        return []
    try:
        hits = cl._search(f"{brand} tablet uses side effects dosage", INDIAN_DOMAINS)
    except cl.LookupUnavailable:
        return []

    bases = [b for b in (_base_name(i) for i in ingredients) if b]
    pages, sites = [], set()
    for h in hits:
        url, snippet = h["url"], h.get("content", "")
        site = cl._domain(url)
        # the page must be about THIS brand (its address contains the brand name), one page per site
        if brand_key not in cl._key(url) or site in sites:
            continue
        text = _get(url)
        if len(text) < 300:  # blocked or built with JavaScript: fall back to the search snippet
            text = snippet
        low = text.lower()
        # safety check: the page must name every active ingredient, otherwise it is a different product
        if not bases or not all(b in low for b in bases):
            continue
        sites.add(site)
        pages.append({"site": site, "url": url, "text": text[:MAX_CHARS]})
        if len(pages) >= MAX_PAGES:
            break
    return pages