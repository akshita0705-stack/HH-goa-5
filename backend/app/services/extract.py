"""Text extraction: PyMuPDF for PDFs, Tesseract OCR for images."""
import io
import re

import fitz  # PyMuPDF
from PIL import Image, ImageOps

from app import config


class ExtractionError(Exception):
    """A user-presentable extraction failure."""


def _ocr(img: Image.Image) -> str:
    try:
        import pytesseract
    except ImportError as exc:  # pragma: no cover
        raise ExtractionError("pytesseract is not installed on the server.") from exc

    if config.TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = config.TESSERACT_CMD

    img = ImageOps.exif_transpose(img).convert("L")
    img = ImageOps.autocontrast(img)
    longest = max(img.size)
    if longest < 1600:  # small photos OCR much better when upscaled
        scale = 1600 / longest
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    try:
        return pytesseract.image_to_string(img, lang=config.OCR_LANG, config="--psm 3")
    except pytesseract.TesseractNotFoundError as exc:
        raise ExtractionError(
            "Tesseract OCR is not installed or not on PATH. See the README for install steps."
        ) from exc
    except Exception as exc:
        raise ExtractionError(f"OCR failed: {exc}") from exc


def extract_pdf(data: bytes) -> list[dict]:
    """Return [{page, text, ocr}] for every page. Scanned pages fall back to OCR."""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise ExtractionError("This PDF could not be opened. It may be corrupted.") from exc
    if doc.needs_pass:
        raise ExtractionError("This PDF is password-protected. Remove the password and try again.")

    pages = []
    for number, page in enumerate(doc, start=1):
        text = page.get_text("text").strip()
        used_ocr = False
        if len(text) < 30:  # probably a scanned page
            try:
                pix = page.get_pixmap(dpi=200)
                text = _ocr(Image.open(io.BytesIO(pix.tobytes("png")))).strip()
                used_ocr = True
            except ExtractionError:
                pass  # keep whatever little text we had
        pages.append({"page": number, "text": text, "ocr": used_ocr})
    doc.close()
    return pages


def extract_image(data: bytes) -> list[dict]:
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as exc:
        raise ExtractionError("This image could not be read. Try a different JPG or PNG.") from exc
    return [{"page": 1, "text": _ocr(img).strip(), "ocr": True}]


def clean_text(text: str) -> str:
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", text)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # re-join hyphenated line breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pages(data: bytes, kind: str) -> list[dict]:
    """Extract + clean. Raises ExtractionError if nothing readable is found."""
    pages = extract_pdf(data) if kind == "pdf" else extract_image(data)
    pages = [{**p, "text": clean_text(p["text"])} for p in pages]
    if not any(len(p["text"]) >= 20 for p in pages):
        if kind == "pdf":
            raise ExtractionError(
                "No readable text found in this PDF. If it is a scan, install Tesseract so it can be read with OCR."
            )
        raise ExtractionError(
            "No readable text found in this image. Try a sharper, well-lit, straight-on photo."
        )
    return pages
