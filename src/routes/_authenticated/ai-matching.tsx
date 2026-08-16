import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/ai-matching")({
  head: () => ({
    meta: [
      { title: "AI Matching — TrialBridge" },
      { name: "description", content: "Eligibility matching engine for patient-to-trial screening." },
      { property: "og:title", content: "AI Matching — TrialBridge" },
      { property: "og:description", content: "Eligibility matching engine for patient-to-trial screening." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PlaceholderPage
      title="AI Matching"
      description="Eligibility matching engine for patient-to-trial screening."
      icon={Sparkles}
    />
  );
}
