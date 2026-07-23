interface Props {
  hidePassive: boolean;
  onToggle: (v: boolean) => void;
}

export function FilterToggle({ hidePassive, onToggle }: Props) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <span className="text-gray-500 text-xs uppercase tracking-wider font-medium">Filter</span>
      <button
        onClick={() => onToggle(!hidePassive)}
        type="button"
        className={[
          "relative w-10 h-5 rounded-full transition-all duration-300",
          hidePassive ? "bg-blue-600" : "bg-gray-700",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300",
            hidePassive ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
      <span className="text-xs text-gray-400">Hide Passive</span>
    </label>
  );
}
