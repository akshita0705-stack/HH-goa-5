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


def add_chunks(session_id: str, doc_id: str, source: str, kind: str, pages: list[dict]) -> int:
    """pages: [{page, chunks: [str]}]. Replaces any earlier chunks for this doc."""
    col = _collection(session_id)
    col.delete(where={"doc_id": doc_id})
    ids, docs, metas = [], [], []
    for p in pages:
        for i, chunk in enumerate(p["chunks"]):
            ids.append(f"{doc_id}-{p['page']}-{i}")
            docs.append(chunk)
            metas.append({"doc_id": doc_id, "source": source, "page": p["page"], "kind": kind})
    if not ids:
        return 0
    for start in range(0, len(ids), 64):
        end = start + 64
        col.add(ids=ids[start:end], documents=docs[start:end], metadatas=metas[start:end],
                embeddings=embed(docs[start:end]))
    return len(ids)


def count(session_id: str) -> int:
    return _collection(session_id).count()


def query(session_id: str, text: str, k: int) -> list[dict]:
    col = _collection(session_id)
    total = col.count()
    if total == 0:
        return []
    res = col.query(query_embeddings=embed([text]), n_results=min(k, total))
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
