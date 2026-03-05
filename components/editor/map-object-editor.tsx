"use client";

import { useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";

type MapObjectEditorProps = {
  title: string;
  description: string;
  itemLabel: string;
  entries: NamedRecord;
  template: Record<string, unknown>;
  onChange: (next: NamedRecord) => void;
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

export function MapObjectEditor({
  title,
  description,
  itemLabel,
  entries,
  template,
  onChange
}: MapObjectEditorProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<EditorMode>("add");
  const [originalName, setOriginalName] = useState("");
  const [name, setName] = useState("");
  const [fragment, setFragment] = useState("");
  const [error, setError] = useState("");

  const rows = useMemo(() => Object.entries(entries), [entries]);

  const openAddDialog = () => {
    setMode("add");
    setOriginalName("");
    setName("");
    setFragment(toYamlFragment(template));
    setError("");
    setOpen(true);
  };

  const openEditDialog = (entryName: string, value: Record<string, unknown>) => {
    setMode("edit");
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
      if ((mode === "add" || isRenamed) && entries[trimmedName]) {
        setError(`A ${itemLabel} named \"${trimmedName}\" already exists.`);
        return;
      }

      const next = { ...entries };
      if (mode === "edit" && isRenamed) {
        delete next[originalName];
      }
      next[trimmedName] = parsed as Record<string, unknown>;
      onChange(next);
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
          rows.map(([entryName, value]) => (
            <div
              key={entryName}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/70 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{entryName}</Badge>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {summarizeConfig(entryName, value as Record<string, unknown>)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(entryName, value as Record<string, unknown>)}
                >
                  <Pencil className="mr-1 h-4 w-4" /> Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => removeEntry(entryName)}>
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
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
