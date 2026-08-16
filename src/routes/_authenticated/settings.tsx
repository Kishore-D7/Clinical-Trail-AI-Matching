import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — TrialBridge" },
      { name: "description", content: "Workspace, profile and access configuration." },
      { property: "og:title", content: "Settings — TrialBridge" },
      { property: "og:description", content: "Workspace, profile and access configuration." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Workspace, profile and access configuration."
      icon={Settings}
    />
  );
}
