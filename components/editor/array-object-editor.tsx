"use client";

import { useMemo, useState } from "react";
import yaml from "js-yaml";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { DisabledArrayItem } from "@/lib/traefik";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type ArrayObjectEditorProps = {
  title: string;
  description: string;
  itemLabel: string;
  items: Array<Record<string, unknown>>;
  disabledItems: DisabledArrayItem[];
  template: Record<string, unknown>;
  onChange: (next: Array<Record<string, unknown>>) => void;
  onChangeDisabled: (next: DisabledArrayItem[]) => void;
  onToggleItem: (payload: { index?: number; id?: string }, enable: boolean) => void;
  onDeleteDisabledItem: (id: string) => void;
};

function toYamlFragment(value: unknown) {
  return yaml.dump(value, { lineWidth: 100, noRefs: true, sortKeys: false });
}

type EditTarget = { kind: "enabled"; index: number } | { kind: "disabled"; id: string } | null;
type ArrayRow = {
  key: string;
  item: Record<string, unknown>;
  disabled: boolean;
  index?: number;
  id?: string;
};

export function ArrayObjectEditor({
  title,
  description,
  itemLabel,
  items,
  disabledItems,
  template,
  onChange,
  onChangeDisabled,
  onToggleItem,
  onDeleteDisabledItem
}: ArrayObjectEditorProps) {
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [fragment, setFragment] = useState("");
  const [error, setError] = useState("");

  const rows = useMemo<ArrayRow[]>(
    () => [
      ...items.map((item, index) => ({
        key: `enabled-${index}`,
        item,
        index,
        disabled: false
      })),
      ...disabledItems.map((item) => ({
        key: `disabled-${item.id}`,
        item: item.value,
        id: item.id,
        disabled: true
      }))
    ],
    [items, disabledItems]
  );

  const openAdd = () => {
    setEditTarget(null);
    setFragment(toYamlFragment(template));
    setError("");
    setOpen(true);
  };

  const openEditEnabled = (index: number) => {
    setEditTarget({ kind: "enabled", index });
    setFragment(toYamlFragment(items[index]));
    setError("");
    setOpen(true);
  };

  const openEditDisabled = (id: string) => {
    const target = disabledItems.find((item) => item.id === id);
    if (!target) return;
    setEditTarget({ kind: "disabled", id });
    setFragment(toYamlFragment(target.value));
    setError("");
    setOpen(true);
  };

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const save = () => {
    try {
      const parsed = yaml.load(fragment);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError(`The ${itemLabel.toLowerCase()} must be a YAML object.`);
        return;
      }

      const nextEnabled = [...items];
      if (editTarget == null) {
        nextEnabled.push(parsed as Record<string, unknown>);
        onChange(nextEnabled);
      } else if (editTarget.kind === "enabled") {
        nextEnabled[editTarget.index] = parsed as Record<string, unknown>;
        onChange(nextEnabled);
      } else {
        const nextDisabled = disabledItems.map((item) =>
          item.id === editTarget.id ? { ...item, value: parsed as Record<string, unknown> } : item
        );
        onChangeDisabled(nextDisabled);
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid YAML fragment.");
    }
  };

  return (
    <Card className="bg-card/85 backdrop-blur">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button onClick={openAdd} size="sm">
            <Plus className="mr-1 h-4 w-4" /> Add {itemLabel}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No {itemLabel.toLowerCase()}s yet.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.key}
              className="rounded-lg border bg-card/70 p-3"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 md:flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      {itemLabel} {row.disabled ? "(disabled)" : row.index != null ? `#${row.index + 1}` : ""}
                    </p>
                    {row.disabled ? <Badge variant="outline">Disabled</Badge> : <Badge variant="success">Enabled</Badge>}
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{JSON.stringify(row.item)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 md:w-[286px] md:justify-end">
                  <div className="flex h-9 w-[120px] items-center justify-between rounded-md border px-2">
                    <span className="text-xs text-muted-foreground">{row.disabled ? "Off" : "On"}</span>
                    <Switch
                      checked={!row.disabled}
                      onCheckedChange={(checked) =>
                        row.disabled
                          ? row.id
                            ? onToggleItem({ id: row.id }, checked)
                            : null
                          : row.index != null
                            ? onToggleItem({ index: row.index }, checked)
                            : null
                      }
                      aria-label={`${row.disabled ? "Enable" : "Disable"} ${itemLabel.toLowerCase()} ${
                        row.index != null ? `#${row.index + 1}` : ""
                      }`}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-[78px]"
                    onClick={() =>
                      row.disabled && row.id ? openEditDisabled(row.id) : row.index != null ? openEditEnabled(row.index) : null
                    }
                  >
                    <Pencil className="mr-1 h-4 w-4" /> Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-[78px]"
                    onClick={() =>
                      row.disabled
                        ? row.id
                          ? onDeleteDisabledItem(row.id)
                          : null
                        : row.index != null
                          ? remove(row.index)
                          : null
                    }
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget == null ? `Add ${itemLabel}` : `Edit ${itemLabel}`}</DialogTitle>
            <DialogDescription>Configure all fields as YAML.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`${title}-yaml`}>YAML body</Label>
            <Textarea
              id={`${title}-yaml`}
              value={fragment}
              onChange={(event) => setFragment(event.target.value)}
              className="min-h-[300px] font-mono text-xs"
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save {itemLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
