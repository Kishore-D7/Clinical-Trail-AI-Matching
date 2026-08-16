import { createFileRoute } from "@tanstack/react-router";
import { FileScan } from "lucide-react";

import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/patient-processing")({
  head: () => ({
    meta: [
      { title: "Patient Processing — TrialBridge" },
      { name: "description", content: "Intake queue for structuring incoming patient records." },
      { property: "og:title", content: "Patient Processing — TrialBridge" },
      { property: "og:description", content: "Intake queue for structuring incoming patient records." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PlaceholderPage
      title="Patient Processing"
      description="Intake queue for structuring incoming patient records."
      icon={FileScan}
    />
  );
}
