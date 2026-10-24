import { HiggsfieldSettings } from "@/components/settings/higgsfield-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const claude = !!config.anthropicApiKey;
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 pt-10 pb-24 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted">Integrations used by the generation worker.</p>
      </div>
      <HiggsfieldSettings />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Claude</CardTitle>
            <Badge variant={claude ? "success" : "warning"}>{claude ? `Enabled · ${config.claudeModel}` : "Not configured"}</Badge>
          </div>
          <CardDescription>
            Reads the repository to ground the analysis, then writes summary.md and the storyboard. Set <code className="font-mono">ANTHROPIC_API_KEY</code> in{" "}
            <code className="font-mono">.env</code> on the server. Without it, DemoForge uses deterministic templates built from static analysis.
          </CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Sandbox</CardTitle>
            <Badge variant={config.sandbox === "docker" ? "success" : "warning"}>{config.sandbox}</Badge>
          </div>
          <CardDescription>
            Repositories are untrusted code. <code className="font-mono">DEMOFORGE_SANDBOX=docker</code> installs and runs them in a resource-limited container.
            Local mode uses a scrubbed environment, a throwaway HOME and timeouts, which is fine for your own repos but not a security boundary.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </main>
  );
}
