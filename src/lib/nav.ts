import {
  LayoutDashboard,
  Users,
  FileScan,
  FlaskConical,
  Sparkles,
  ListChecks,
  FileText,
  ShieldCheck,
  Activity,
  Download,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  description: string;
};

export const navItems: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    description: "Program-wide overview of patients, trials and matches.",
  },
  {
    title: "Patients",
    url: "/patients",
    icon: Users,
    description: "De-identified patient registry and cohort records.",
  },
  {
    title: "Patient Processing",
    url: "/patient-processing",
    icon: FileScan,
    description: "Intake queue for structuring incoming patient records.",
  },
  {
    title: "Clinical Trials",
    url: "/clinical-trials",
    icon: FlaskConical,
    description: "Trial catalogue with protocol and recruitment status.",
  },
  {
    title: "Matching Engine",
    url: "/ai-matching",
    icon: Sparkles,
    description: "Deterministic rule-based patient-to-trial eligibility engine.",
  },
  {
    title: "Matching Results",
    url: "/matching-results",
    icon: ListChecks,
    description: "Review, score and adjudicate candidate matches.",
  },
  {
    title: "Documents",
    url: "/documents",
    icon: FileText,
    description: "Source documents and their processing state.",
  },
  {
    title: "Compliance",
    url: "/compliance",
    icon: ShieldCheck,
    description: "Consent, audit trail and regulatory checkpoints.",
  },
  {
    title: "Monitoring",
    url: "/monitoring",
    icon: Activity,
    description: "Pipeline health and operational monitoring.",
  },
  {
    title: "Exports",
    url: "/exports",
    icon: Download,
    description: "Generate data extracts for research teams.",
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    description: "Workspace, profile and access configuration.",
  },
];

export function titleForPath(pathname: string): string {
  const match = navItems.find(
    (item) => pathname === item.url || pathname.startsWith(item.url + "/"),
  );
  return match?.title ?? "Dashboard";
}
