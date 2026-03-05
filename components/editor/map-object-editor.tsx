"use client";

import { useEffect, useMemo, useState } from "react";
import yaml from "js-yaml";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { NamedRecord } from "@/lib/traefik";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type MapObjectEditorProps = {
  title: string;
  description: string;
  itemLabel: string;
  entries: NamedRecord;
  disabledEntries: NamedRecord;
  template: Record<string, unknown>;
  onChange: (next: NamedRecord) => void;
  onChangeDisabled: (next: NamedRecord) => void;
  onToggleEntry: (entryName: string, enable: boolean) => void;
  onDeleteDisabledEntry: (entryName: string) => void;
};

type EditorMode = "add" | "edit";

function toYamlFragment(value: unknown) {
  return yaml.dump(value, { lineWidth: 100, noRefs: true, sortKeys: false });
}

function summarizeConfig(name: string, item: Record<string, unknown>) {
  if (typeof item.rule === "string") return item.rule;
  if (typeof item.service === "string") return `service: ${item.service}`;
  if (item.loadBalancer && typeof item.loadBalancer === "object") {
    const servers = (item.loadBalancer as { servers?: unknown[] }).servers;
    if (Array.isArray(servers)) return `${servers.length} load-balancer server(s)`;
  }
  return `${name} (${Object.keys(item).length} field${Object.keys(item).length === 1 ? "" : "s"})`;
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function MapObjectEditor({
  title,
  description,
  itemLabel,
  entries,
  disabledEntries,
  template,
  onChange,
  onChangeDisabled,
  onToggleEntry,
  onDeleteDisabledEntry
}: MapObjectEditorProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<EditorMode>("add");
  const [editingDisabled, setEditingDisabled] = useState(false);
  const [originalName, setOriginalName] = useState("");
  const [name, setName] = useState("");
  const [fragment, setFragment] = useState("");
  const [error, setError] = useState("");
  const [rowOrder, setRowOrder] = useState<string[]>(() => [
    ...Object.keys(entries),
    ...Object.keys(disabledEntries)
  ]);

  useEffect(() => {
    const naturalOrder = [...Object.keys(entries), ...Object.keys(disabledEntries)];
    const naturalSet = new Set(naturalOrder);

    setRowOrder((current) => {
      const next = current.filter((key) => naturalSet.has(key));
      for (const key of naturalOrder) {
        if (!next.includes(key)) {
          next.push(key);
        }
      }
      return arraysEqual(current, next) ? current : next;
    });
  }, [entries, disabledEntries]);

  const rows = useMemo(
    () =>
      rowOrder
        .map((entryName) => {
          if (entries[entryName]) {
            return {
              entryName,
              value: entries[entryName] as Record<string, unknown>,
              disabled: false
            };
          }
          if (disabledEntries[entryName]) {
            return {
              entryName,
              value: disabledEntries[entryName] as Record<string, unknown>,
              disabled: true
            };
          }
          return null;
        })
        .filter((row): row is { entryName: string; value: Record<string, unknown>; disabled: boolean } => Boolean(row)),
    [rowOrder, entries, disabledEntries]
  );

  const openAddDialog = () => {
    setMode("add");
    setEditingDisabled(false);
    setOriginalName("");
    setName("");
    setFragment(toYamlFragment(template));
    setError("");
    setOpen(true);
  };

  const openEditDialog = (entryName: string, value: Record<string, unknown>, disabled: boolean) => {
    setMode("edit");
    setEditingDisabled(disabled);
    setOriginalName(entryName);
    setName(entryName);
    setFragment(toYamlFragment(value));
    setError("");
    setOpen(true);
  };

  const removeEntry = (entryName: string) => {
    const next = { ...entries };
    delete next[entryName];
    onChange(next);
  };

  const save = () => {
    if (!name.trim()) {
      setError(`${itemLabel} name is required.`);
      return;
    }

    try {
      const parsed = yaml.load(fragment);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError(`The ${itemLabel} body must be a YAML object.`);
        return;
      }

      const trimmedName = name.trim();
      const isRenamed = mode === "edit" && trimmedName !== originalName;
      const nameTakenInEnabled = entries[trimmedName] && !(mode === "edit" && !editingDisabled && !isRenamed);
      const nameTakenInDisabled =
        disabledEntries[trimmedName] && !(mode === "edit" && editingDisabled && !isRenamed);

      if ((mode === "add" || isRenamed) && (nameTakenInEnabled || nameTakenInDisabled)) {
        setError(`A ${itemLabel} named "${trimmedName}" already exists.`);
        return;
      }

      if (editingDisabled) {
        const nextDisabled = { ...disabledEntries };
        if (mode === "edit" && isRenamed) {
          delete nextDisabled[originalName];
        }
        nextDisabled[trimmedName] = parsed as Record<string, unknown>;
        onChangeDisabled(nextDisabled);
      } else {
        const nextEnabled = { ...entries };
        if (mode === "edit" && isRenamed) {
          delete nextEnabled[originalName];
        }
        nextEnabled[trimmedName] = parsed as Record<string, unknown>;
        onChange(nextEnabled);
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
          <Button onClick={openAddDialog} size="sm">
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
              key={`${row.disabled ? "disabled" : "enabled"}-${row.entryName}`}
              className="rounded-lg border bg-card/70 p-3"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 md:flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="max-w-[24rem] truncate">
                      {row.entryName}
                    </Badge>
                    {row.disabled ? <Badge variant="outline">Disabled</Badge> : <Badge variant="success">Enabled</Badge>}
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {summarizeConfig(row.entryName, row.value)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 md:w-[286px] md:justify-end">
                  <div className="flex h-9 w-[120px] items-center justify-between rounded-md border px-2">
                    <span className="text-xs text-muted-foreground">{row.disabled ? "Off" : "On"}</span>
                    <Switch
                      checked={!row.disabled}
                      onCheckedChange={(checked) => onToggleEntry(row.entryName, checked)}
                      aria-label={`${row.disabled ? "Enable" : "Disable"} ${itemLabel.toLowerCase()} ${row.entryName}`}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-[78px]"
                    onClick={() => openEditDialog(row.entryName, row.value, row.disabled)}
                  >
                    <Pencil className="mr-1 h-4 w-4" /> Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-[78px]"
                    onClick={() => (row.disabled ? onDeleteDisabledEntry(row.entryName) : removeEntry(row.entryName))}
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
            <DialogTitle>{mode === "add" ? `Add ${itemLabel}` : `Edit ${itemLabel}`}</DialogTitle>
            <DialogDescription>
              Edit this {itemLabel.toLowerCase()} as raw YAML so every Traefik field is supported.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`${title}-name`}>{itemLabel} name</Label>
            <Input id={`${title}-name`} value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${title}-yaml`}>YAML body</Label>
            <Textarea
              id={`${title}-yaml`}
              value={fragment}
              onChange={(event) => setFragment(event.target.value)}
              className="min-h-[280px] font-mono text-xs"
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
