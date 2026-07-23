interface Props {
  signalType: "radar_alert" | "trigger_entry";
  newsClassification?: "passive" | "skip" | "transitional" | "fatal";
  summary?: string;
}

export function ActionBadge({ signalType, newsClassification, summary }: Props) {
  if (signalType === "trigger_entry") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold tracking-wide 
                     bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
        title={summary}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500" style={{ boxShadow: "0 0 6px rgba(34,197,94,0.9)" }} />
        ENTRY
        {newsClassification && (
          <span className="ml-1 text-emerald-400/60 font-normal">
            {newsClassification === "skip" ? "SKIP" : "PASSIVE"}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold tracking-wide 
                   bg-amber-500/10 text-amber-400 border border-amber-500/20"
      title={summary}
    >
      <span className="w-2 h-2 rounded-full bg-amber-400" />
      RADAR
    </span>
  );
}
