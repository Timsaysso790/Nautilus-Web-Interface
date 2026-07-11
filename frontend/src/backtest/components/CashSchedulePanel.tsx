import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, DollarSign } from "lucide-react";
import type { CashSchedule, LumpSumInjection } from "../types";

interface Props {
  value: CashSchedule;
  onChange: (v: CashSchedule) => void;
}

function createInjection(): LumpSumInjection {
  return { date: "", amount: 0, label: "" };
}

export function CashSchedulePanel({ value, onChange }: Props) {
  const updateInjections = (inj: LumpSumInjection[]) => {
    onChange({ ...value, lumpSumInjections: inj });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Cash Schedule</CardTitle>
          <Switch checked={value.enabled} onCheckedChange={v => onChange({ ...value, enabled: v })} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!value.enabled && (
          <p className="text-xs text-muted-foreground text-center py-2">Cash injections disabled.</p>
        )}
        {value.enabled && (
          <>
            {/* Paycheck Pump */}
            <div className="border border-border rounded-md p-3 space-y-2 bg-muted/10">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Paycheck Pump</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Amount ($)</Label>
                  <Input
                    type="number"
                    value={value.paycheckAmount}
                    onChange={e => onChange({ ...value, paycheckAmount: Number(e.target.value) })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Frequency</Label>
                  <Select
                    value={value.paycheckFrequency}
                    onValueChange={(v: any) => onChange({ ...value, paycheckFrequency: v })}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Lump Sums */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Lump Sum Injections</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => updateInjections([...value.lumpSumInjections, createInjection()])}
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              {value.lumpSumInjections.map((inj, idx) => (
                <div key={idx} className="border border-border rounded-md p-2 bg-muted/10">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Date</Label>
                      <Input
                        type="date"
                        value={inj.date}
                        onChange={e => {
                          const next = [...value.lumpSumInjections];
                          next[idx] = { ...next[idx], date: e.target.value };
                          updateInjections(next);
                        }}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Amount ($)</Label>
                      <Input
                        type="number"
                        value={inj.amount || ""}
                        onChange={e => {
                          const next = [...value.lumpSumInjections];
                          next[idx] = { ...next[idx], amount: Number(e.target.value) };
                          updateInjections(next);
                        }}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Label</Label>
                      <Input
                        value={inj.label}
                        onChange={e => {
                          const next = [...value.lumpSumInjections];
                          next[idx] = { ...next[idx], label: e.target.value };
                          updateInjections(next);
                        }}
                        className="h-7 text-xs"
                        placeholder="e.g. Tastytrade sweep"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end mt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-destructive"
                      onClick={() => updateInjections(value.lumpSumInjections.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
