import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/matching-results")({
  head: () => ({
    meta: [
      { title: "Matching Results — TrialBridge" },
      { name: "description", content: "Review, score and adjudicate candidate matches." },
      { property: "og:title", content: "Matching Results — TrialBridge" },
      { property: "og:description", content: "Review, score and adjudicate candidate matches." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PlaceholderPage
      title="Matching Results"
      description="Review, score and adjudicate candidate matches."
      icon={ListChecks}
    />
  );
}
