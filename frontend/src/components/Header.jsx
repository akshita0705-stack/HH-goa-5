import { MLVLogo } from "./icons";

export default function Header({ health }) {
  const offline = health?.status === "offline";
  const warnings = [];
  if (offline) warnings.push("Can't reach the backend. Start it with: uvicorn app.main:app --reload (in the backend folder).");
  else if (health) {
    if (!health.llm_configured) warnings.push("The LLM API key is missing. Add ANTHROPIC_API_KEY to backend/.env and restart the backend.");
    if (!health.tesseract) warnings.push("Tesseract OCR isn't installed, so photos and scanned PDFs can't be read. Text PDFs still work.");
  }
  return (
    <header className="pt-8 pb-3 flex flex-col items-center text-center">
      <div className="flex flex-col items-center gap-3">
        <MLVLogo />
        <div className="mt-1">
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-none tracking-tight text-white drop-shadow-[0_4px_16px_rgba(12,46,38,0.75)]">
            MedLeaf Voice
          </h1>
          <p className="mt-2.5 text-base sm:text-lg font-medium text-emerald-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            Ask about your medicine out loud.
          </p>
        </div>
      </div>
      {warnings.map((w) => (
        <p key={w} role="alert" className="mt-4 max-w-xl rounded-xl border border-alarm-edge bg-alarm-bg/95 backdrop-blur-md px-4 py-3 text-sm text-alarm-text shadow-lg">{w}</p>
      ))}
    </header>
  );
}
