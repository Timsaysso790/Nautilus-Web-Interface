import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIERS = {
  free: { label: "Free ($0)", cap: "EOD only, 2023+, 30 req/min, 1-day delay" },
  value: { label: "Options Value ($40/mo)", cap: "1-min bars, 2020+, 2 concurrent, 15-min delay" },
  standard: { label: "Options Standard ($80/mo)", cap: "5-min/tick, 2016+, 4 concurrent, real-time, Greeks" },
  pro: { label: "Options Pro ($160/mo)", cap: "5-min/tick, 2012+, 8 concurrent, real-time, full Greeks" },
} as const;

export type ThetaTier = keyof typeof TIERS;

interface Props {
  value: ThetaTier;
  onChange: (tier: ThetaTier) => void;
}

export function ThetaTierSelector({ value, onChange }: Props) {
  const info = TIERS[value];
  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={(v) => onChange(v as ThetaTier)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {(Object.entries(TIERS) as [ThetaTier, typeof info][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{info.cap}</p>
    </div>
  );
}
