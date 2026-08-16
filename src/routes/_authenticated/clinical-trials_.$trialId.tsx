import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  ListChecks,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AiExtractCriteriaDialog } from "@/components/trials/ai-extract-dialog";
import { CriterionDialog } from "@/components/trials/criterion-dialog";
import { TrialFormDialog } from "@/components/trials/trial-form-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime, formatNumber, humanize } from "@/lib/patients";
import {
  criterionExpression,
  humanizeType,
  phaseLabel,
  trialStatusTone,
  type CriterionRow,
} from "@/lib/trials";
import { ErrorState } from "@/routes/_authenticated/patients";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clinical-trials_/$trialId")({
  head: () => ({
    meta: [
      { title: "Trial Details — TrialBridge" },
      {
        name: "description",
        content:
          "Protocol overview, eligibility criteria, matched patients, documents, compliance and monitoring for a clinical trial.",
      },
      { property: "og:title", content: "Trial Details — TrialBridge" },
      {
        property: "og:description",
        content: "Protocol overview, eligibility criteria and matched patients for a trial.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrialDetailPage,
});

function TrialDetailPage() {
  const { trialId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canManage = (currentUser?.roles ?? []).length > 0;

  const [editOpen, setEditOpen] = useState(false);
  const [criterionOpen, setCriterionOpen] = useState(false);
  const [aiExtractOpen, setAiExtractOpen] = useState(false);
  const [editingCriterion, setEditingCriterion] = useState<CriterionRow | null>(null);
  const [pendingCriterion, setPendingCriterion] = useState<CriterionRow | null>(null);

  const trialQuery = useQuery({
    queryKey: ["trial", trialId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_trials")
        .select("*")
        .eq("id", trialId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const criteriaQuery = useQuery({
    queryKey: ["trial-criteria", trialId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trial_criteria")
        .select("*")
        .eq("trial_id", trialId)
        .order("criterion_type", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const matchesQuery = useQuery({
    queryKey: ["trial-matches", trialId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trial_matches")
        .select("*, patients(id, patient_code, full_name, age, sex, status, primary_condition)")
        .eq("trial_id", trialId)
        .order("score", { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const documentsQuery = useQuery({
    queryKey: ["trial-documents", trialId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const deleteCriterion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trial_criteria").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Criterion deleted");
      queryClient.invalidateQueries({ queryKey: ["trial-criteria", trialId] });
      setPendingCriterion(null);
    },
    onError: (error: { message?: string; code?: string }) => {
      toast.error(
        error.code === "42501"
          ? "You do not have permission to delete criteria."
          : (error.message ?? "Could not delete the criterion"),
      );
    },
  });

  if (trialQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (trialQuery.isError) {
    return (
      <ErrorState
        message={(trialQuery.error as Error).message}
        onRetry={() => trialQuery.refetch()}
      />
    );
  }

  const trial = trialQuery.data;
  if (!trial) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trial not found</CardTitle>
          <CardDescription>This trial may have been deleted.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/clinical-trials">
              <ArrowLeft className="size-4" /> Back to trials
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const criteria = criteriaQuery.data ?? [];
  const inclusion = criteria.filter((c) => c.criterion_type === "INCLUSION");
  const exclusion = criteria.filter((c) => c.criterion_type === "EXCLUSION");
  const matches = matchesQuery.data ?? [];
  const needsReview = matches.filter((m) => m.needs_review).length;

  const complianceChecks = [
    { label: "Trial code assigned", ok: Boolean(trial.trial_code) },
    { label: "Protocol description recorded", ok: Boolean(trial.description) },
    { label: "Sponsor recorded", ok: Boolean(trial.sponsor) },
    { label: "Start date set", ok: Boolean(trial.start_date) },
    { label: "At least one inclusion criterion", ok: inclusion.length > 0 },
    { label: "At least one exclusion criterion", ok: exclusion.length > 0 },
    { label: "Matches reviewed", ok: matches.length > 0 && needsReview === 0 },
  ];
  const passed = complianceChecks.filter((check) => check.ok).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/clinical-trials">
              <ArrowLeft className="size-4" /> Trials
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{trial.title}</h1>
            <Badge variant="outline" className={cn(trialStatusTone[trial.status])}>
              {humanize(trial.status)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {trial.trial_code} · {phaseLabel(trial.phase)} · {trial.sponsor ?? "No sponsor"}
          </p>
        </div>
        <Button disabled={!canManage} onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" /> Edit trial
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="criteria">Eligibility Criteria</TabsTrigger>
            <TabsTrigger value="patients">Patients</TabsTrigger>
            <TabsTrigger value="matches">Matches</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Protocol</CardTitle>
              <CardDescription>Core trial information.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Trial code" value={trial.trial_code} />
              <Detail label="NCT ID" value={trial.nct_id ?? "—"} />
              <Detail label="Sponsor" value={trial.sponsor ?? "—"} />
              <Detail label="Phase" value={phaseLabel(trial.phase)} />
              <Detail label="Condition" value={trial.condition ?? "—"} />
              <Detail label="Location" value={trial.location ?? "—"} />
              <Detail label="Start date" value={formatDate(trial.start_date)} />
              <Detail label="End date" value={formatDate(trial.end_date)} />
              <Detail label="Created" value={formatDateTime(trial.created_at)} />
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Description</p>
                <p className="text-sm">{trial.description ?? "No description recorded."}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Eligibility criteria" value={criteria.length} icon={ListChecks} />
            <StatCard label="Patient matches" value={matches.length} icon={Users} />
            <StatCard label="Needs review" value={needsReview} icon={ClipboardList} />
          </div>
        </TabsContent>

        <TabsContent value="criteria" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Eligibility criteria</CardTitle>
                <CardDescription>
                  {inclusion.length} inclusion · {exclusion.length} exclusion
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canManage}
                  onClick={() => setAiExtractOpen(true)}
                >
                  <Sparkles className="size-4" /> AI Extract Criteria
                </Button>
                <Button
                  size="sm"
                  disabled={!canManage}
                  onClick={() => {
                    setEditingCriterion(null);
                    setCriterionOpen(true);
                  }}
                >
                  <Plus className="size-4" /> Add criterion
                </Button>
              </div>
            </CardHeader>

            <CardContent className="px-0 sm:px-6">
              {criteriaQuery.isLoading ? (
                <div className="space-y-2 px-4 sm:px-0">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : criteriaQuery.isError ? (
                <ErrorState
                  className="mx-4 sm:mx-0"
                  message={(criteriaQuery.error as Error).message}
                  onRetry={() => criteriaQuery.refetch()}
                />
              ) : criteria.length === 0 ? (
                <EmptyBlock
                  icon={ListChecks}
                  title="No criteria yet"
                  description="Add inclusion and exclusion rules such as Age >= 18 or eGFR < 30."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Field</TableHead>
                        <TableHead>Operator</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {criteria.map((criterion) => (
                        <TableRow key={criterion.id}>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                criterion.criterion_type === "INCLUSION"
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "border-destructive/40 bg-destructive/10 text-destructive",
                              )}
                            >
                              {humanizeType(criterion.criterion_type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{criterion.field}</TableCell>
                          <TableCell>{criterion.operator}</TableCell>
                          <TableCell>
                            {criterion.operator === "BETWEEN"
                              ? `${criterion.value} – ${criterion.value_secondary ?? "?"}`
                              : criterion.value}
                          </TableCell>
                          <TableCell>{criterion.unit ?? "—"}</TableCell>
                          <TableCell>{criterion.required ? "Yes" : "No"}</TableCell>
                          <TableCell className="max-w-[220px] truncate">
                            {criterion.description ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Edit criterion"
                                disabled={!canManage}
                                onClick={() => {
                                  setEditingCriterion(criterion);
                                  setCriterionOpen(true);
                                }}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Delete criterion"
                                disabled={!canManage}
                                onClick={() => setPendingCriterion(criterion)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patients" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Patients</CardTitle>
              <CardDescription>Patients linked to this trial through matching.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {matchesQuery.isLoading ? (
                <Skeleton className="mx-4 h-24 sm:mx-0" />
              ) : matches.length === 0 ? (
                <EmptyBlock
                  icon={Users}
                  title="No patients linked yet"
                  description="Patients appear here once they are matched to this trial."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>Sex</TableHead>
                        <TableHead>Primary condition</TableHead>
                        <TableHead className="text-right">Open</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matches.map((match) => (
                        <TableRow key={match.id}>
                          <TableCell className="font-medium">
                            {match.patients?.patient_code ?? "—"}
                          </TableCell>
                          <TableCell>{match.patients?.full_name ?? "—"}</TableCell>
                          <TableCell>{match.patients?.age ?? "—"}</TableCell>
                          <TableCell>{humanize(match.patients?.sex)}</TableCell>
                          <TableCell>{match.patients?.primary_condition ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                navigate({
                                  to: "/patients/$patientId",
                                  params: { patientId: match.patient_id },
                                })
                              }
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matches" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Matches</CardTitle>
              <CardDescription>Scored matches and review state.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {matchesQuery.isLoading ? (
                <Skeleton className="mx-4 h-24 sm:mx-0" />
              ) : matches.length === 0 ? (
                <EmptyBlock
                  icon={ClipboardList}
                  title="No matches yet"
                  description="Run matching to score patients against this trial's criteria."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Review</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matches.map((match) => (
                        <TableRow key={match.id}>
                          <TableCell className="font-medium">
                            {match.patients?.patient_code ?? "—"}
                          </TableCell>
                          <TableCell>{formatNumber(match.score, 2)}</TableCell>
                          <TableCell>{humanize(match.status)}</TableCell>
                          <TableCell>
                            <Badge variant={match.needs_review ? "outline" : "secondary"}>
                              {match.needs_review ? "Needs review" : "Reviewed"}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(match.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents</CardTitle>
              <CardDescription>Recently uploaded clinical documents.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {documentsQuery.isLoading ? (
                <Skeleton className="mx-4 h-24 sm:mx-0" />
              ) : (documentsQuery.data ?? []).length === 0 ? (
                <EmptyBlock
                  icon={FileText}
                  title="No documents"
                  description="Documents uploaded in the workspace will be listed here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Uploaded</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(documentsQuery.data ?? []).map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">{doc.file_name}</TableCell>
                          <TableCell>{doc.doc_type ?? "—"}</TableCell>
                          <TableCell>{humanize(doc.processing_status)}</TableCell>
                          <TableCell>{formatDate(doc.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Protocol compliance</CardTitle>
              <CardDescription>
                {passed} of {complianceChecks.length} readiness checks complete.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {complianceChecks.map((check) => (
                <div
                  key={check.label}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <span>{check.label}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      check.ok
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {check.ok ? "Complete" : "Pending"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monitoring</CardTitle>
              <CardDescription>Recruitment and activity snapshot.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Total matches" value={matches.length} icon={Users} />
                <StatCard label="Awaiting review" value={needsReview} icon={ClipboardList} />
                <StatCard label="Criteria defined" value={criteria.length} icon={ListChecks} />
              </div>
              <Separator />
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Current status" value={humanize(trial.status)} />
                <Detail label="Last updated" value={formatDateTime(trial.updated_at)} />
                <Detail label="Recruitment window" value={`${formatDate(trial.start_date)} → ${formatDate(trial.end_date)}`} />
                <Detail label="Site" value={trial.location ?? "—"} />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TrialFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        trial={trial}
        criteria={criteria}
      />

      <AiExtractCriteriaDialog
        open={aiExtractOpen}
        onOpenChange={setAiExtractOpen}
        trialId={trialId}
      />

      <CriterionDialog
        open={criterionOpen}
        onOpenChange={setCriterionOpen}
        trialId={trialId}
        criterion={editingCriterion}
      />

      <AlertDialog
        open={Boolean(pendingCriterion)}
        onOpenChange={(open) => !open && setPendingCriterion(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Delete this criterion?</AlertDialogTitle>
          <AlertDialogHeader>
            <AlertDialogDescription>
              {pendingCriterion ? criterionExpression(pendingCriterion) : ""} will be removed from
              this trial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (pendingCriterion) deleteCriterion.mutate(pendingCriterion.id);
              }}
            >
              {deleteCriterion.isPending ? "Deleting…" : "Delete criterion"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyBlock({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Users;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-5" />
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
