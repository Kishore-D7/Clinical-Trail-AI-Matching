import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance — TrialBridge" },
      { name: "description", content: "Consent, audit trail and regulatory checkpoints." },
      { property: "og:title", content: "Compliance — TrialBridge" },
      { property: "og:description", content: "Consent, audit trail and regulatory checkpoints." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PlaceholderPage
      title="Compliance"
      description="Consent, audit trail and regulatory checkpoints."
      icon={ShieldCheck}
    />
  );
}
