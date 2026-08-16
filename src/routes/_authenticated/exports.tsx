import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/exports")({
  head: () => ({
    meta: [
      { title: "Exports — TrialBridge" },
      { name: "description", content: "Generate data extracts for research teams." },
      { property: "og:title", content: "Exports — TrialBridge" },
      { property: "og:description", content: "Generate data extracts for research teams." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PlaceholderPage
      title="Exports"
      description="Generate data extracts for research teams."
      icon={Download}
    />
  );
}
