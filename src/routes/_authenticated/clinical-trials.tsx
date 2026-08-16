import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  FlaskConical,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, humanize } from "@/lib/patients";
import {
  phaseLabel,
  TRIAL_PHASES,
  TRIAL_STATUSES,
  trialStatusTone,
  type CriterionRow,
  type TrialRow,
} from "@/lib/trials";
import { ErrorState } from "@/routes/_authenticated/patients";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type SortKey = "trial_code" | "title" | "sponsor" | "phase" | "status" | "created_at";

export const Route = createFileRoute("/_authenticated/clinical-trials")({
  head: () => ({
    meta: [
      { title: "Clinical Trials — TrialBridge" },
      {
        name: "description",
        content:
          "Create, search and manage clinical trials with eligibility criteria and recruitment status.",
      },
      { property: "og:title", content: "Clinical Trials — TrialBridge" },
      {
        property: "og:description",
        content: "Trial catalogue with protocol, eligibility criteria and recruitment status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrialsPage,
});

function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function TrialsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canManage = (currentUser?.roles ?? []).length > 0;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [phaseFilter, setPhaseFilter] = useState("ALL");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: "created_at",
    asc: false,
  });
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<{ trial: TrialRow; criteria: CriterionRow[] } | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<TrialRow | null>(null);

  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter, phaseFilter, sort]);

  const query = useQuery({
    queryKey: ["trials", { debouncedSearch, statusFilter, phaseFilter, sort, page }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let request = supabase
        .from("clinical_trials")
        .select("*", { count: "exact" })
        .order(sort.key, { ascending: sort.asc, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const term = debouncedSearch.trim().replace(/[%,()]/g, " ").trim();
      if (term) {
        request = request.or(
          `trial_code.ilike.%${term}%,title.ilike.%${term}%,sponsor.ilike.%${term}%,condition.ilike.%${term}%,location.ilike.%${term}%`,
        );
      }
      if (statusFilter !== "ALL") request = request.eq("status", statusFilter as TrialRow["status"]);
      if (phaseFilter !== "ALL") request = request.eq("phase", phaseFilter);

      const { data, error, count } = await request;
      if (error) throw new Error(error.message);

      const rows = data ?? [];
      const ids = rows.map((row) => row.id);
      let matchCounts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: matches } = await supabase
          .from("trial_matches")
          .select("trial_id")
          .in("trial_id", ids);
        matchCounts = (matches ?? []).reduce<Record<string, number>>((acc, match) => {
          acc[match.trial_id] = (acc[match.trial_id] ?? 0) + 1;
          return acc;
        }, {});
      }

      return { rows, total: count ?? 0, matchCounts };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinical_trials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trial deleted");
      queryClient.invalidateQueries({ queryKey: ["trials"] });
      setPendingDelete(null);
    },
    onError: (error: { message?: string; code?: string }) => {
      toast.error(
        error.code === "42501"
          ? "You do not have permission to delete trials."
          : (error.message ?? "Could not delete the trial"),
      );
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const matchCounts = query.data?.matchCounts ?? {};
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(search) || statusFilter !== "ALL" || phaseFilter !== "ALL";

  const rangeLabel = useMemo(() => {
    if (total === 0) return "0 trials";
    const from = page * PAGE_SIZE + 1;
    const to = Math.min(total, (page + 1) * PAGE_SIZE);
    return `${from}–${to} of ${total} trials`;
  }, [page, total]);

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, asc: !prev.asc } : { key, asc: true }));
  }

  async function openEdit(trial: TrialRow) {
    const { data, error } = await supabase
      .from("trial_criteria")
      .select("*")
      .eq("trial_id", trial.id)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Could not load the trial criteria");
      return;
    }
    setEditing({ trial, criteria: data ?? [] });
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clinical Trials</h1>
          <p className="text-sm text-muted-foreground">
            Trial catalogue with protocol details, eligibility criteria and recruitment status.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          disabled={!canManage}
          title={canManage ? undefined : "Requires a staff account"}
        >
          <Plus className="size-4" /> New trial
        </Button>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">Trial registry</CardTitle>
              <CardDescription>{rangeLabel}</CardDescription>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:items-center">
              <div className="relative sm:col-span-2 lg:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search code, name or sponsor"
                  className="pl-8"
                  aria-label="Search trials"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="lg:w-36" aria-label="Filter by status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  {TRIAL_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {humanize(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                <SelectTrigger className="lg:w-32" aria-label="Filter by phase">
                  <SelectValue placeholder="Phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All phases</SelectItem>
                  {TRIAL_PHASES.map((phase) => (
                    <SelectItem key={phase} value={phase}>
                      {phaseLabel(phase)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 sm:px-6">
          {query.isError ? (
            <ErrorState
              message={(query.error as Error).message}
              onRetry={() => query.refetch()}
              className="mx-4 sm:mx-0"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Trial code" sortKey="trial_code" sort={sort} onSort={toggleSort} />
                    <SortableHead label="Trial name" sortKey="title" sort={sort} onSort={toggleSort} />
                    <SortableHead label="Sponsor" sortKey="sponsor" sort={sort} onSort={toggleSort} />
                    <SortableHead label="Phase" sortKey="phase" sort={sort} onSort={toggleSort} />
                    <TableHead>Location</TableHead>
                    <SortableHead label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                    <TableHead className="text-right">Matches</TableHead>
                    <SortableHead label="Created" sortKey="created_at" sort={sort} onSort={toggleSort} />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        {Array.from({ length: 9 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                            <FlaskConical className="size-5" />
                          </span>
                          <div className="space-y-1">
                            <h3 className="text-sm font-semibold">
                              {hasFilters ? "No trials match these filters" : "No trials yet"}
                            </h3>
                            <p className="max-w-sm text-sm text-muted-foreground">
                              {hasFilters
                                ? "Try a different search term or clear the filters."
                                : "Create your first trial to start defining eligibility criteria."}
                            </p>
                          </div>
                          {hasFilters ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSearch("");
                                setStatusFilter("ALL");
                                setPhaseFilter("ALL");
                              }}
                            >
                              Clear filters
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={!canManage}
                              onClick={() => {
                                setEditing(null);
                                setFormOpen(true);
                              }}
                            >
                              <Plus className="size-4" /> New trial
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.trial_code}</TableCell>
                        <TableCell className="max-w-[260px] truncate" title={row.title}>
                          {row.title}
                        </TableCell>
                        <TableCell>{row.sponsor ?? "—"}</TableCell>
                        <TableCell>{phaseLabel(row.phase)}</TableCell>
                        <TableCell>{row.location ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("whitespace-nowrap", trialStatusTone[row.status])}
                          >
                            {humanize(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {matchCounts[row.id] ?? 0}
                        </TableCell>
                        <TableCell>{formatDate(row.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Row actions">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() =>
                                  navigate({
                                    to: "/clinical-trials/$trialId",
                                    params: { trialId: row.id },
                                  })
                                }
                              >
                                <Eye className="size-4" /> View details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!canManage}
                                onSelect={() => void openEdit(row)}
                              >
                                <Pencil className="size-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!canManage}
                                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                onSelect={() => setPendingDelete(row)}
                              >
                                <Trash2 className="size-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-6">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || query.isFetching}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pageCount || query.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <TrialFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        trial={editing?.trial ?? null}
        criteria={editing?.criteria ?? []}
      />

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.trial_code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the trial, its eligibility criteria and patient matches. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete?.id) deleteMutation.mutate(pendingDelete.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete trial"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; asc: boolean };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.asc ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}
