import { createFileRoute } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/clinical-trials")({
  head: () => ({
    meta: [
      { title: "Clinical Trials — TrialBridge" },
      { name: "description", content: "Trial catalogue with protocol and recruitment status." },
      { property: "og:title", content: "Clinical Trials — TrialBridge" },
      { property: "og:description", content: "Trial catalogue with protocol and recruitment status." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PlaceholderPage
      title="Clinical Trials"
      description="Trial catalogue with protocol and recruitment status."
      icon={FlaskConical}
    />
  );
}
