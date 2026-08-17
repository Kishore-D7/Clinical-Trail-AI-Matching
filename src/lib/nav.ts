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
  UserCog,
  type LucideIcon,
} from "lucide-react";

import { APP_ROLES, type AppRole } from "@/lib/roles";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  description: string;
  /** Roles allowed to see and open this section. */
  roles: AppRole[];
};

const ALL = APP_ROLES;

export const navItems: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    description: "Program-wide overview of patients, trials and matches.",
    roles: ALL,
  },
  {
    title: "Users",
    url: "/users",
    icon: UserCog,
    description: "Manage accounts, roles and account status.",
    roles: ["ADMIN"],
  },
  {
    title: "Patients",
    url: "/patients",
    icon: Users,
    description: "De-identified patient registry and cohort records.",
    roles: ALL,
  },
  {
    title: "Patient Processing",
    url: "/patient-processing",
    icon: FileScan,
    description: "Intake queue for structuring incoming patient records.",
    roles: ["RESEARCHER", "CLINICAL_COORDINATOR"],
  },
  {
    title: "Clinical Trials",
    url: "/clinical-trials",
    icon: FlaskConical,
    description: "Trial catalogue with protocol and recruitment status.",
    roles: ALL,
  },
  {
    title: "Matching Engine",
    url: "/ai-matching",
    icon: Sparkles,
    description: "Deterministic rule-based patient-to-trial eligibility engine.",
    roles: ["RESEARCHER"],
  },
  {
    title: "Matching Results",
    url: "/matching-results",
    icon: ListChecks,
    description: "Review, score and adjudicate candidate matches.",
    roles: ["RESEARCHER"],
  },
  {
    title: "Documents",
    url: "/documents",
    icon: FileText,
    description: "Source documents and their processing state.",
    roles: ALL,
  },
  {
    title: "Compliance",
    url: "/compliance",
    icon: ShieldCheck,
    description: "Consent, audit trail and regulatory checkpoints.",
    roles: ["CLINICAL_COORDINATOR", "ADMIN"],
  },
  {
    title: "Monitoring",
    url: "/monitoring",
    icon: Activity,
    description: "Pipeline health and operational monitoring.",
    roles: ALL,
  },
  {
    title: "Exports",
    url: "/exports",
    icon: Download,
    description: "Generate data extracts for research teams.",
    roles: ["RESEARCHER"],
  },
  {
    title: "Profile",
    url: "/settings",
    icon: Settings,
    description: "Profile, role and access configuration.",
    roles: ALL,
  },
];

export function navItemsForRole(role: AppRole | null | undefined): NavItem[] {
  if (!role) return navItems.filter((item) => item.url === "/dashboard" || item.url === "/settings");
  return navItems.filter((item) => item.roles.includes(role));
}

export function canAccessPath(role: AppRole | null | undefined, pathname: string): boolean {
  const match = navItems.find(
    (item) => pathname === item.url || pathname.startsWith(item.url + "/"),
  );
  if (!match) return true;
  return Boolean(role && match.roles.includes(role));
}

export function titleForPath(pathname: string): string {
  const match = navItems.find(
    (item) => pathname === item.url || pathname.startsWith(item.url + "/"),
  );
  return match?.title ?? "Dashboard";
}
