import { promises as fs } from "node:fs";
import { ThemeToggle } from "@/components/theme-toggle";
import { TraefikEditor } from "@/components/editor/traefik-editor";
import { ensureConfigShape, parseDynamicYaml } from "@/lib/traefik";
import { getResolvedDynamicConfigPath } from "@/lib/config-path";

async function readInitialConfig(configPath: string) {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return ensureConfigShape(parseDynamicYaml(raw));
  } catch {
    return ensureConfigShape({});
  }
}

export default async function HomePage() {
  const configPath = getResolvedDynamicConfigPath();
  const initialConfig = await readInitialConfig(configPath);

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
        <TraefikEditor initialConfig={initialConfig} configPath={configPath} />
      </div>
    </main>
  );
}
