"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, LogOut, RefreshCw, Save } from "lucide-react";
import {
  ensureConfigShape,
  getArrayAtPath,
  getMapAtPath,
  parseDynamicYaml,
  setArrayAtPath,
  setMapAtPath,
  toDynamicYaml,
  type NamedRecord,
  type TraefikDynamicConfig
} from "@/lib/traefik";
import { templates } from "@/lib/templates";
import { ArrayObjectEditor } from "@/components/editor/array-object-editor";
import { MapObjectEditor } from "@/components/editor/map-object-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type SaveState = "idle" | "saving" | "saved" | "error";

const SECTION_META = [
  { path: ["http", "routers"], label: "HTTP Routers" },
  { path: ["http", "services"], label: "HTTP Services" },
  { path: ["http", "middlewares"], label: "HTTP Middlewares" },
  { path: ["tcp", "routers"], label: "TCP Routers" },
  { path: ["tcp", "services"], label: "TCP Services" },
  { path: ["udp", "routers"], label: "UDP Routers" },
  { path: ["udp", "services"], label: "UDP Services" },
  { path: ["tls", "certificates"], label: "TLS Certificates", isArray: true }
] as const;

function countEntries(config: TraefikDynamicConfig) {
  return SECTION_META.reduce((count, section) => {
    if ("isArray" in section && section.isArray) {
      return count + getArrayAtPath(config, section.path).length;
    }
    return count + Object.keys(getMapAtPath(config, section.path)).length;
  }, 0);
}

const MAX_RENDERED_DIFF_LINES = 600;

type SaveDiffPreview = {
  text: string;
  additions: number;
  removals: number;
  changed: boolean;
  truncated: boolean;
};

const MAX_CONFIRM_TEXT_CHARS = 15000;

type DiffEntry = {
  type: "add" | "remove";
  line: string;
  oldLine?: number;
  newLine?: number;
};

function splitYamlLines(input: string): string[] {
  const normalized = input.replace(/\r\n/g, "\n");
  if (!normalized) {
    return [];
  }
  return normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
}

function computeLineDiff(before: string[], after: string[]): DiffEntry[] {
  const n = before.length;
  const m = after.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (before[i] === after[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const entries: DiffEntry[] = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (before[i] === after[j]) {
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      entries.push({ type: "remove", line: before[i], oldLine: i + 1 });
      i += 1;
    } else {
      entries.push({ type: "add", line: after[j], newLine: j + 1 });
      j += 1;
    }
  }

  while (i < n) {
    entries.push({ type: "remove", line: before[i], oldLine: i + 1 });
    i += 1;
  }

  while (j < m) {
    entries.push({ type: "add", line: after[j], newLine: j + 1 });
    j += 1;
  }

  return entries;
}

function buildSaveDiffPreview(currentContent: string, nextContent: string): SaveDiffPreview {
  if (currentContent === nextContent) {
    return {
      text: "No textual changes detected. Save will keep the file unchanged.",
      additions: 0,
      removals: 0,
      changed: false,
      truncated: false
    };
  }

  const diffEntries = computeLineDiff(splitYamlLines(currentContent), splitYamlLines(nextContent));
  const additions = diffEntries.filter((entry) => entry.type === "add").length;
  const removals = diffEntries.length - additions;

  const rendered = diffEntries.slice(0, MAX_RENDERED_DIFF_LINES).map((entry) => {
    if (entry.type === "add") {
      return `+ [new ${entry.newLine}] ${entry.line}`;
    }
    return `- [old ${entry.oldLine}] ${entry.line}`;
  });

  const truncated = diffEntries.length > MAX_RENDERED_DIFF_LINES;
  if (truncated) {
    rendered.push(`... ${diffEntries.length - MAX_RENDERED_DIFF_LINES} more changed line(s) not shown`);
  }

  return {
    text: rendered.join("\n"),
    additions,
    removals,
    changed: true,
    truncated
  };
}

type TraefikEditorProps = {
  initialConfig: TraefikDynamicConfig;
  configPath: string;
  authEnabled: boolean;
};

export function TraefikEditor({ initialConfig, configPath, authEnabled }: TraefikEditorProps) {
  const [config, setConfig] = useState<TraefikDynamicConfig>(() => ensureConfigShape(initialConfig));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string>("");
  const [rawYaml, setRawYaml] = useState<string>("");
  const [rawDirty, setRawDirty] = useState(false);
  const [rawError, setRawError] = useState("");
  const [isPreparingSave, setIsPreparingSave] = useState(false);

  const yamlText = useMemo(() => toDynamicYaml(config), [config]);
  const totalEntries = useMemo(() => countEntries(config), [config]);

  useEffect(() => {
    if (!rawDirty) {
      setRawYaml(yamlText);
    }
  }, [yamlText, rawDirty]);

  const updateMap = (path: readonly string[], value: NamedRecord) => {
    setConfig((current) => ensureConfigShape(setMapAtPath(current, path, value)));
    setSaveState("idle");
  };

  const updateArray = (path: readonly string[], value: Array<Record<string, unknown>>) => {
    setConfig((current) => ensureConfigShape(setArrayAtPath(current, path, value)));
    setSaveState("idle");
  };

  const fetchLatestConfigContent = async () => {
    const response = await fetch(`/api/config?ts=${Date.now()}`, {
      method: "GET",
      cache: "no-store"
    });
    if (!response.ok) {
      let errorMessage = "Failed to load dynamic config file.";
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) {
          errorMessage = body.error;
        }
      } catch {
        // Keep fallback message.
      }
      throw new Error(errorMessage);
    }
    return (await response.json()) as { content: string; path: string };
  };

  const reloadFromDisk = async () => {
    setMessage("");
    setRawError("");
    try {
      const data = await fetchLatestConfigContent();
      const parsed = data.content?.trim().length ? parseDynamicYaml(data.content) : {};
      const shaped = ensureConfigShape(parsed);
      setConfig(shaped);
      setRawYaml(toDynamicYaml(shaped));
      setRawDirty(false);
      setSaveState("idle");
      setMessage(`Reloaded config from ${data.path}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to read configured dynamic file.");
      setSaveState("error");
    }
  };

  const prepareSaveConfirmation = async () => {
    setMessage("");
    setRawError("");
    setIsPreparingSave(true);

    try {
      const data = await fetchLatestConfigContent();
      const diffPreview = buildSaveDiffPreview(data.content ?? "", yamlText);
      const header = `Save changes to ${configPath}?\\n+${diffPreview.additions} additions, -${diffPreview.removals} removals`;
      const bodyText =
        diffPreview.text.length > MAX_CONFIRM_TEXT_CHARS
          ? `${diffPreview.text.slice(0, MAX_CONFIRM_TEXT_CHARS)}\\n... diff preview truncated`
          : diffPreview.text;
      const confirmed = window.confirm(`${header}\\n\\n${bodyText}`);
      if (!confirmed) {
        setSaveState("idle");
        setMessage("Save cancelled.");
        return;
      }
      await confirmAndSave();
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Unable to prepare save preview.");
    } finally {
      setIsPreparingSave(false);
    }
  };

  const confirmAndSave = async () => {
    setSaveState("saving");
    setMessage("");

    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: yamlText })
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to write dynamic.yml");
      }

      setSaveState("saved");
      setMessage(`Saved to ${configPath}.`);
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Unable to save configured dynamic file.");
    }
  };

  const downloadYaml = () => {
    const blob = new Blob([yamlText], { type: "application/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dynamic.yml";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const applyRawYaml = () => {
    try {
      const parsed = parseDynamicYaml(rawYaml);
      setConfig(ensureConfigShape(parsed));
      setRawDirty(false);
      setRawError("");
      setSaveState("idle");
      setMessage("Raw YAML applied to visual editor.");
    } catch (error) {
      setRawError(error instanceof Error ? error.message : "Invalid YAML");
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="bg-card/80 backdrop-blur">
          <CardHeader className="pb-2">
            <CardDescription>Total managed objects</CardDescription>
            <CardTitle className="text-3xl">{totalEntries}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-card/80 backdrop-blur">
          <CardHeader className="pb-2">
            <CardDescription>File target</CardDescription>
            <CardTitle className="break-all text-base">{configPath}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="success">Traefik file provider</Badge>
          </CardContent>
        </Card>
        <Card className="bg-card/80 backdrop-blur">
          <CardHeader className="pb-2">
            <CardDescription>Actions</CardDescription>
            <CardTitle className="text-sm text-muted-foreground">Load, edit, validate, and save</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reloadFromDisk}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reload
            </Button>
            <Button onClick={prepareSaveConfirmation} disabled={saveState === "saving" || isPreparingSave}>
              <Save className="mr-2 h-4 w-4" />{" "}
              {isPreparingSave ? "Preparing..." : saveState === "saving" ? "Saving..." : "Save"}
            </Button>
            <Button variant="secondary" onClick={downloadYaml}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
            {authEnabled ? (
              <Button variant="outline" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {message ? (
        <Alert variant={saveState === "error" ? "destructive" : "default"} className="mb-6 bg-card/90">
          {saveState === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
          <AlertTitle>{saveState === "error" ? "Action failed" : "Status"}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="bg-card/85 backdrop-blur">
          <CardHeader>
            <CardTitle>Visual Dynamic Config Editor</CardTitle>
            <CardDescription>
              Uses Traefik dynamic sections (`http`, `tcp`, `udp`, `tls`) and keeps full YAML flexibility per item.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="http">
              <TabsList>
                <TabsTrigger value="http">HTTP</TabsTrigger>
                <TabsTrigger value="tcp">TCP</TabsTrigger>
                <TabsTrigger value="udp">UDP</TabsTrigger>
                <TabsTrigger value="tls">TLS</TabsTrigger>
                <TabsTrigger value="raw">Raw YAML</TabsTrigger>
              </TabsList>

              <TabsContent value="http" className="space-y-4">
                <MapObjectEditor
                  title="HTTP Routers"
                  description="Rules, entryPoints, TLS, middlewares and service binding."
                  itemLabel="Router"
                  entries={getMapAtPath(config, ["http", "routers"])}
                  template={templates.httpRouter}
                  onChange={(next) => updateMap(["http", "routers"], next)}
                />
                <MapObjectEditor
                  title="HTTP Services"
                  description="Load balancer, weighted, mirroring, or failover service definitions."
                  itemLabel="Service"
                  entries={getMapAtPath(config, ["http", "services"])}
                  template={templates.httpService}
                  onChange={(next) => updateMap(["http", "services"], next)}
                />
                <MapObjectEditor
                  title="HTTP Middlewares"
                  description="Any middleware type, including plugins and chain definitions."
                  itemLabel="Middleware"
                  entries={getMapAtPath(config, ["http", "middlewares"])}
                  template={templates.httpMiddleware}
                  onChange={(next) => updateMap(["http", "middlewares"], next)}
                />
                <MapObjectEditor
                  title="HTTP Servers Transports"
                  description="Backend connection transport options for HTTP services."
                  itemLabel="Transport"
                  entries={getMapAtPath(config, ["http", "serversTransports"])}
                  template={templates.httpServersTransport}
                  onChange={(next) => updateMap(["http", "serversTransports"], next)}
                />
              </TabsContent>

              <TabsContent value="tcp" className="space-y-4">
                <MapObjectEditor
                  title="TCP Routers"
                  description="HostSNI rules, entry points, middleware and TLS passthrough settings."
                  itemLabel="Router"
                  entries={getMapAtPath(config, ["tcp", "routers"])}
                  template={templates.tcpRouter}
                  onChange={(next) => updateMap(["tcp", "routers"], next)}
                />
                <MapObjectEditor
                  title="TCP Services"
                  description="TCP load balancer definitions and server addresses."
                  itemLabel="Service"
                  entries={getMapAtPath(config, ["tcp", "services"])}
                  template={templates.tcpService}
                  onChange={(next) => updateMap(["tcp", "services"], next)}
                />
                <MapObjectEditor
                  title="TCP Middlewares"
                  description="MiddlewareTCP definitions such as IP allow list and InFlightConn."
                  itemLabel="Middleware"
                  entries={getMapAtPath(config, ["tcp", "middlewares"])}
                  template={templates.tcpMiddleware}
                  onChange={(next) => updateMap(["tcp", "middlewares"], next)}
                />
                <MapObjectEditor
                  title="TCP Servers Transports"
                  description="Transport tuning for TLS and connection behavior to TCP backends."
                  itemLabel="Transport"
                  entries={getMapAtPath(config, ["tcp", "serversTransports"])}
                  template={templates.tcpServersTransport}
                  onChange={(next) => updateMap(["tcp", "serversTransports"], next)}
                />
              </TabsContent>

              <TabsContent value="udp" className="space-y-4">
                <MapObjectEditor
                  title="UDP Routers"
                  description="UDP entryPoints and service associations."
                  itemLabel="Router"
                  entries={getMapAtPath(config, ["udp", "routers"])}
                  template={templates.udpRouter}
                  onChange={(next) => updateMap(["udp", "routers"], next)}
                />
                <MapObjectEditor
                  title="UDP Services"
                  description="UDP load balancer and server addresses."
                  itemLabel="Service"
                  entries={getMapAtPath(config, ["udp", "services"])}
                  template={templates.udpService}
                  onChange={(next) => updateMap(["udp", "services"], next)}
                />
              </TabsContent>

              <TabsContent value="tls" className="space-y-4">
                <ArrayObjectEditor
                  title="TLS Certificates"
                  description="Static cert/key files for dynamic TLS attachment."
                  itemLabel="Certificate"
                  items={getArrayAtPath(config, ["tls", "certificates"])}
                  template={templates.tlsCertificate}
                  onChange={(next) => updateArray(["tls", "certificates"], next)}
                />
                <MapObjectEditor
                  title="TLS Options"
                  description="Cipher suites, min/max versions, and SNI strictness sets."
                  itemLabel="TLS Option Set"
                  entries={getMapAtPath(config, ["tls", "options"])}
                  template={templates.tlsOption}
                  onChange={(next) => updateMap(["tls", "options"], next)}
                />
                <MapObjectEditor
                  title="TLS Stores"
                  description="Default certificates and store-level mappings."
                  itemLabel="TLS Store"
                  entries={getMapAtPath(config, ["tls", "stores"])}
                  template={templates.tlsStore}
                  onChange={(next) => updateMap(["tls", "stores"], next)}
                />
              </TabsContent>

              <TabsContent value="raw" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Use this tab for direct full-file editing. Apply updates to sync back into the visual editor.
                </p>
                <Textarea
                  className="min-h-[460px] font-mono text-xs"
                  value={rawYaml}
                  onChange={(event) => {
                    setRawYaml(event.target.value);
                    setRawDirty(true);
                    setRawError("");
                  }}
                />
                {rawError ? <p className="text-sm text-destructive">{rawError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={applyRawYaml}>Apply to Visual Editor</Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setRawYaml(yamlText);
                      setRawDirty(false);
                      setRawError("");
                    }}
                  >
                    Reset from Visual
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Live YAML Preview</CardTitle>
            <CardDescription>
              Generated from the current visual state. Saved output is validated before writing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[70vh] rounded-md border bg-muted/40 p-4">
              <pre className="text-xs leading-5 text-foreground">{yamlText}</pre>
            </ScrollArea>
            <Separator className="my-4" />
            <p className="text-xs text-muted-foreground">
              Tip: if Traefik supports a field that does not have dedicated quick inputs yet, edit that object body directly in
              its YAML dialog.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
