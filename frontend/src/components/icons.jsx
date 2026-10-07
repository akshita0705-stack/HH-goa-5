const base = {
  width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
};
const make = (children) => (props) => <svg {...base} {...props}>{children}</svg>;

export const MicIcon = make(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>);
export const StopIcon = make(<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />);
export const PlayIcon = make(<path d="M8 5v14l11-7z" fill="currentColor" />);
export const ReplayIcon = make(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>);
export const SendIcon = make(<path d="M5 12h14M13 6l6 6-6 6" />);
export const TrashIcon = make(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />);
export const CloseIcon = make(<path d="M6 6l12 12M18 6L6 18" />);
export const AlertIcon = make(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>);
export const CheckIcon = make(<path d="M5 12l5 5 9-10" />);
export const UploadIcon = make(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v4h16v-4" /></>);
export const PdfIcon = make(<><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 14h6M9 17h4" /></>);

export function LeafMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M18 3c11 0 15 7 15 15 0 8-7 15-15 15S3 26 3 18C3 9 9 3 18 3z" fill="#12372F" />
      <path d="M11 18v2M15 14v10M19 11v16M23 15v8M27 18v2" stroke="#7ED3AE" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function MLVLogo({ size = 64 }) {
  return (
    <div className="group relative flex items-center justify-center transition-transform hover:scale-105 duration-300">
      <div className="absolute -inset-1.5 rounded-3xl bg-gradient-to-r from-amber-400 via-emerald-400 to-teal-300 opacity-85 blur-md animate-pulse"></div>
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0c2e26] via-[#12372F] to-[#1a4d41] border border-emerald-300/40 shadow-xl">
        <span className="font-display font-black text-2xl tracking-wider text-amber-200 drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
          MLV
        </span>
      </div>
    </div>
  );
}

export function Spinner({ className = "" }) {
  return (
    <svg className={`spinner ${className}`} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
