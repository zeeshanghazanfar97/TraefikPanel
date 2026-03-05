import { promises as fs } from "node:fs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { TraefikEditor } from "@/components/editor/traefik-editor";
import { AUTH_SESSION_COOKIE, isAuthEnabled, isValidSessionToken } from "@/lib/auth";
import { createEmptyDisabledCollections, ensureConfigShape, extractDisabledCollections, parseDynamicYaml } from "@/lib/traefik";
import { getResolvedDynamicConfigPath } from "@/lib/config-path";

export const dynamic = "force-dynamic";

async function readInitialConfig(configPath: string) {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return {
      config: ensureConfigShape(parseDynamicYaml(raw)),
      disabled: extractDisabledCollections(raw),
      error: null as string | null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error while reading dynamic config.";
    return { config: ensureConfigShape({}), disabled: createEmptyDisabledCollections(), error: message };
  }
}

export default async function HomePage() {
  const authEnabled = isAuthEnabled();
  const token = cookies().get(AUTH_SESSION_COOKIE)?.value;
  if (authEnabled && !isValidSessionToken(token)) {
    redirect("/login");
  }

  const configPath = getResolvedDynamicConfigPath();
  const initialLoad = configPath
    ? await readInitialConfig(configPath)
    : { config: ensureConfigShape({}), disabled: createEmptyDisabledCollections(), error: null as string | null };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-32 left-[-12%] h-[34rem] w-[34rem] rounded-full bg-orange-300/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-12rem] right-[-6rem] h-[34rem] w-[34rem] rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="relative z-10 py-10">
        <section className="mx-auto mb-6 max-w-7xl px-4 md:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                Traefik Dynamic Config Studio
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-muted-foreground md:text-base">
                Build and maintain `dynamic.yml` visually with full YAML-level control for routers, services, middlewares,
                and TLS.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </section>
        {configPath && initialLoad.error ? (
          <section className="mx-auto mb-4 max-w-7xl px-4 md:px-8">
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
              <p className="text-sm font-semibold text-destructive">Unable to read dynamic config file.</p>
              <p className="mt-1 break-all text-xs text-destructive">
                Path: <code>{configPath}</code>
              </p>
              <p className="mt-1 text-xs text-destructive">{initialLoad.error}</p>
              <p className="mt-1 text-xs text-destructive">
                If running in Docker, verify the host file is bind-mounted to container path `/data/dynamic.yml`.
              </p>
            </div>
          </section>
        ) : null}
        {configPath ? (
          <TraefikEditor
            initialConfig={initialLoad.config}
            initialDisabledCollections={initialLoad.disabled}
            configPath={configPath}
            authEnabled={authEnabled}
          />
        ) : (
          <section className="mx-auto max-w-7xl px-4 md:px-8">
            <div className="rounded-lg border bg-card/85 p-6 backdrop-blur">
              <h2 className="text-xl font-semibold text-foreground">Missing Environment Variable</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                `DYNAMIC_CONFIG_PATH` is not set. Add it to your `.env` file and restart the app.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Example: <code>DYNAMIC_CONFIG_PATH=/absolute/path/to/dynamic.yml</code>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">The editor is disabled until this variable is configured.</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
