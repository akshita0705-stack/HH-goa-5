const BASE = import.meta.env.VITE_API_BASE ?? "";

async function request(path, options) {
  let res;
  try {
    res = await fetch(BASE + path, options);
  } catch {
    throw new Error("Can't reach the MedLeaf server. Make sure the backend is running on port 8000.");
  }
  if (!res.ok) {
    let message = `Something went wrong (error ${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail.map((d) => d.msg).join("; ");
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return res.json();
}

const json = (body, method = "POST") => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request("/api/health"),

  upload(sessionId, files) {
    const form = new FormData();
    form.append("session_id", sessionId);
    files.forEach((f) => form.append("files", f));
    return request("/api/upload", { method: "POST", body: form });
  },

  process: (sessionId, docIds) =>
    request("/api/process", json({ session_id: sessionId, doc_ids: docIds })),

  transcribe(blob) {
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
    const form = new FormData();
    form.append("audio", blob, `question.${ext}`);
    return request("/api/transcribe", { method: "POST", body: form });
  },

  extractImage(file) {
    const form = new FormData();
    form.append("file", file);
    return request("/api/extract/image", { method: "POST", body: form });
  },

  identify: (text) => request("/api/identify", json({ text })),

  loadMedicine: (sessionId, payload) => {
    const body = typeof payload === "object" && !Array.isArray(payload)
      ? { session_id: sessionId, ...payload }
      : { session_id: sessionId, ingredients: payload };
    return request("/api/medicine/load", json(body));
  },

  ask: (sessionId, question, history, docId) =>
    request("/api/ask", json({ session_id: sessionId, question, history, doc_id: docId })),

  removeDocument: (sessionId, docId) =>
    request(`/api/documents/${sessionId}/${docId}`, { method: "DELETE" }),

  clearSession: (sessionId) => request(`/api/session/${sessionId}`, { method: "DELETE" }),
};