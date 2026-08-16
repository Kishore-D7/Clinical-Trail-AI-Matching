import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents — TrialBridge" },
      { name: "description", content: "Source documents and their processing state." },
      { property: "og:title", content: "Documents — TrialBridge" },
      { property: "og:description", content: "Source documents and their processing state." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PlaceholderPage
      title="Documents"
      description="Source documents and their processing state."
      icon={FileText}
    />
  );
}
