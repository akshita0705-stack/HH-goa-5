"""sentence-transformers embeddings + ChromaDB, one collection per browser session."""
import hashlib
import shutil
import threading

import chromadb
from chromadb.config import Settings

from app import config

_lock = threading.Lock()
_model = None
_client = None


def session_key(session_id: str) -> str:
    return hashlib.sha1(session_id.encode()).hexdigest()[:32]


def get_model():
    global _model
    with _lock:
        if _model is None:
            from sentence_transformers import SentenceTransformer

            _model = SentenceTransformer(config.EMBEDDING_MODEL)
        return _model


def _get_client():
    global _client
    with _lock:
        if _client is None:
            _client = chromadb.PersistentClient(
                path=str(config.CHROMA_DIR), settings=Settings(anonymized_telemetry=False)
            )
        return _client


def _collection(session_id: str):
    return _get_client().get_or_create_collection(
        name="s" + session_key(session_id), metadata={"hnsw:space": "cosine"}
    )


def embed(texts: list[str]) -> list[list[float]]:
    return get_model().encode(texts, normalize_embeddings=True, show_progress_bar=False).tolist()


def add_chunks(session_id: str, doc_id: str, source: str, kind: str, pages: list[dict], note: str = "") -> int:
    """pages: [{page, chunks: [str], section?, group?}]. Replaces any earlier chunks for this doc."""
    col = _collection(session_id)
    col.delete(where={"doc_id": doc_id})
    ids, docs, metas = [], [], []
    for p in pages:
        for i, chunk in enumerate(p["chunks"]):
            ids.append(f"{doc_id}-{p['page']}-{i}")
            docs.append(chunk)
            metas.append({
                "doc_id": doc_id, "source": p.get("source", source), "page": p["page"], "kind": kind,
                "section": p.get("section", ""), "group": p.get("group", ""), "note": note,
                "url": p.get("url", ""),
            })
    if not ids:
        return 0
    for start in range(0, len(ids), 64):
        end = start + 64
        col.add(ids=ids[start:end], documents=docs[start:end], metadatas=metas[start:end],
                embeddings=embed(docs[start:end]))
    return len(ids)

def count(session_id: str, doc_id: str | None = None) -> int:
    """Number of stored chunks for the session, or only for one medicine (doc_id)."""
    col = _collection(session_id)
    if doc_id:
        return len(col.get(where={"doc_id": doc_id}, include=[])["ids"])
    return col.count()


def query(session_id: str, text: str, k: int, doc_id: str | None = None, sections: list[str] | None = None) -> list[dict]:
    """Nearest chunks. doc_id = only that medicine; sections = only those label sections."""
    col = _collection(session_id)
    total = count(session_id, doc_id)
    if total == 0:
        return []
    conds = []
    if doc_id:
        conds.append({"doc_id": doc_id})
    if sections:
        conds.append({"section": {"$in": list(sections)}})
    where = None if not conds else conds[0] if len(conds) == 1 else {"$and": conds}
    try:
        res = col.query(query_embeddings=embed([text]), n_results=min(k, total), where=where)
    except Exception:
        if sections:
            return []
        raise
    out = []
    for doc, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
        out.append({"text": doc, "distance": dist, **meta})
    return out


def delete_doc(session_id: str, doc_id: str) -> None:
    _collection(session_id).delete(where={"doc_id": doc_id})
    shutil.rmtree(config.UPLOAD_DIR / session_key(session_id) / doc_id, ignore_errors=True)


def delete_session(session_id: str) -> None:
    try:
        _get_client().delete_collection("s" + session_key(session_id))
    except Exception:
        pass
    shutil.rmtree(config.UPLOAD_DIR / session_key(session_id), ignore_errors=True)