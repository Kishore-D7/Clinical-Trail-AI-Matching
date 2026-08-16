import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/monitoring")({
  head: () => ({
    meta: [
      { title: "Monitoring — TrialBridge" },
      { name: "description", content: "Pipeline health and operational monitoring." },
      { property: "og:title", content: "Monitoring — TrialBridge" },
      { property: "og:description", content: "Pipeline health and operational monitoring." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PlaceholderPage
      title="Monitoring"
      description="Pipeline health and operational monitoring."
      icon={Activity}
    />
  );
}
