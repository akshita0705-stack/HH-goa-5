export const medicineName = (m) =>
    m.display_name || m.brand || (m.ingredients || []).join(", ") || "Medicine";

export default function ChatTabs({ medicines, activeId, chats, onSelect }) {
    if (medicines.length < 2) return null;
    return (
        <div role="tablist" aria-label="Medicine chats" className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {medicines.map((m) => {
                const active = m.doc_id === activeId;
                const msgs = chats[m.doc_id] || [];
                const pending = msgs.some((x) => x.status === "pending");
                return (
                    <button
                        key={m.doc_id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onSelect(m.doc_id)}
                        className={`flex max-w-[220px] shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${active
                                ? "border-pine bg-pine text-white shadow"
                                : "border-line bg-white/80 text-pine hover:bg-mint"
                            }`}
                    >
                        <span className="truncate">{medicineName(m)}</span>
                        {pending ? (
                            <span className="text-xs opacity-80" aria-label="Looking up an answer">...</span>
                        ) : (
                            msgs.length > 0 && (
                                <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-mint"}`}>{msgs.length}</span>
                            )
                        )}
                    </button>
                );
            })}
        </div>
    );
}