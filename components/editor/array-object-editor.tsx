"use client";

import { useMemo, useState } from "react";
import yaml from "js-yaml";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

type ArrayObjectEditorProps = {
  title: string;
  description: string;
  itemLabel: string;
  items: Array<Record<string, unknown>>;
  template: Record<string, unknown>;
  onChange: (next: Array<Record<string, unknown>>) => void;
};

function toYamlFragment(value: unknown) {
  return yaml.dump(value, { lineWidth: 100, noRefs: true, sortKeys: false });
}

export function ArrayObjectEditor({
  title,
  description,
  itemLabel,
  items,
  template,
  onChange
}: ArrayObjectEditorProps) {
  const [open, setOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [fragment, setFragment] = useState("");
  const [error, setError] = useState("");

  const rows = useMemo(() => items, [items]);

  const openAdd = () => {
    setEditIndex(null);
    setFragment(toYamlFragment(template));
    setError("");
    setOpen(true);
  };

  const openEdit = (index: number) => {
    setEditIndex(index);
    setFragment(toYamlFragment(rows[index]));
    setError("");
    setOpen(true);
  };

  const remove = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  const save = () => {
    try {
      const parsed = yaml.load(fragment);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError(`The ${itemLabel.toLowerCase()} must be a YAML object.`);
        return;
      }

      const next = [...rows];
      if (editIndex == null) {
        next.push(parsed as Record<string, unknown>);
      } else {
        next[editIndex] = parsed as Record<string, unknown>;
      }
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
          rows.map((item, index) => (
            <div
              key={`${itemLabel}-${index}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/70 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{itemLabel} #{index + 1}</p>
                <p className="truncate text-sm text-muted-foreground">{JSON.stringify(item)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(index)}>
                  <Pencil className="mr-1 h-4 w-4" /> Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => remove(index)}>
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
            <DialogTitle>{editIndex == null ? `Add ${itemLabel}` : `Edit ${itemLabel}`}</DialogTitle>
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
