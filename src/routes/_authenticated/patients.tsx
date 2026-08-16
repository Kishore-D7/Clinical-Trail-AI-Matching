import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
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
import {
  formatDate,
  formatNumber,
  humanize,
  SEX_OPTIONS,
  VERIFICATION_OPTIONS,
  verificationTone,
  type PatientListRow,
  type PatientRow,
  type VerificationStatus,
} from "@/lib/patients";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type SortKey = "patient_code" | "full_name" | "age" | "hba1c" | "bmi" | "egfr" | "created_at";

export const Route = createFileRoute("/_authenticated/patients")({
  head: () => ({
    meta: [
      { title: "Patients — TrialBridge" },
      {
        name: "description",
        content:
          "Search, filter and manage the de-identified patient registry with verified clinical measurements.",
      },
      { property: "og:title", content: "Patients — TrialBridge" },
      {
        property: "og:description",
        content: "De-identified patient registry with verified clinical measurements.",
      },
    ],
  }),
  component: PatientsPage,
});

function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function PatientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canManage = (currentUser?.roles ?? []).some(
    (role) => role === "ADMIN" || role === "CLINICAL_COORDINATOR",
  );

  const [search, setSearch] = useState("");
  const [sexFilter, setSexFilter] = useState<string>("ALL");
  const [verificationFilter, setVerificationFilter] = useState<string>("ALL");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: "created_at",
    asc: false,
  });
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PatientRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PatientListRow | null>(null);

  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, sexFilter, verificationFilter, sort]);

  const query = useQuery({
    queryKey: ["patients", { debouncedSearch, sexFilter, verificationFilter, sort, page }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let request = supabase
        .from("patient_list_view")
        .select("*", { count: "exact" })
        .order(sort.key, { ascending: sort.asc, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const term = debouncedSearch.trim();
      if (term) {
        const safe = term.replace(/[%,()]/g, " ").trim();
        if (safe) {
          request = request.or(
            `patient_code.ilike.%${safe}%,full_name.ilike.%${safe}%,conditions_text.ilike.%${safe}%,primary_condition.ilike.%${safe}%`,
          );
        }
      }
      if (sexFilter !== "ALL") request = request.eq("sex", sexFilter);
      if (verificationFilter !== "ALL")
        request = request.eq("verification_status", verificationFilter);

      const { data, error, count } = await request;
      if (error) throw new Error(error.message);
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("patients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Patient deleted");
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setPendingDelete(null);
    },
    onError: (error: { message?: string; code?: string }) => {
      toast.error(
        error.code === "42501"
          ? "You do not have permission to delete patients."
          : (error.message ?? "Could not delete the patient"),
      );
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(search) || sexFilter !== "ALL" || verificationFilter !== "ALL";

  const rangeLabel = useMemo(() => {
    if (total === 0) return "0 patients";
    const from = page * PAGE_SIZE + 1;
    const to = Math.min(total, (page + 1) * PAGE_SIZE);
    return `${from}–${to} of ${total} patients`;
  }, [page, total]);

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, asc: !prev.asc } : { key, asc: true }));
  }

  function openEdit(id: string) {
    supabase
      .from("patients")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error("Could not load this patient");
          return;
        }
        setEditing(data);
        setFormOpen(true);
      });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">
            De-identified patient registry with AI-extracted clinical values and researcher
            verification.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          disabled={!canManage}
          title={canManage ? undefined : "Requires coordinator or administrator access"}
        >
          <Plus className="size-4" /> Add patient
        </Button>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">Patient registry</CardTitle>
              <CardDescription>{rangeLabel}</CardDescription>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:items-center">
              <div className="relative sm:col-span-2 lg:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search ID, name or condition"
                  className="pl-8"
                  aria-label="Search patients"
                />
              </div>
              <Select value={sexFilter} onValueChange={setSexFilter}>
                <SelectTrigger className="lg:w-36" aria-label="Filter by sex">
                  <SelectValue placeholder="Sex" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All sexes</SelectItem>
                  {SEX_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {humanize(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={verificationFilter} onValueChange={setVerificationFilter}>
                <SelectTrigger className="lg:w-40" aria-label="Filter by verification status">
                  <SelectValue placeholder="Verification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  {VERIFICATION_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {humanize(option)}
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
                    <SortableHead
                      label="Patient ID"
                      sortKey="patient_code"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      label="Name"
                      sortKey="full_name"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <SortableHead label="Age" sortKey="age" sort={sort} onSort={toggleSort} />
                    <TableHead>Sex</TableHead>
                    <TableHead className="min-w-44">Conditions</TableHead>
                    <SortableHead label="HbA1c" sortKey="hba1c" sort={sort} onSort={toggleSort} />
                    <SortableHead label="BMI" sortKey="bmi" sort={sort} onSort={toggleSort} />
                    <SortableHead label="eGFR" sortKey="egfr" sort={sort} onSort={toggleSort} />
                    <TableHead>Verification</TableHead>
                    <SortableHead
                      label="Created"
                      sortKey="created_at"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isLoading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <TableRow key={index}>
                        {Array.from({ length: 11 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-4 w-full min-w-12" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-14">
                        <EmptyState
                          hasFilters={hasFilters}
                          canManage={canManage}
                          onClear={() => {
                            setSearch("");
                            setSexFilter("ALL");
                            setVerificationFilter("ALL");
                          }}
                          onAdd={() => {
                            setEditing(null);
                            setFormOpen(true);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id} className={query.isFetching ? "opacity-70" : undefined}>
                        <TableCell className="font-medium">
                          <Link
                            to="/patients/$patientId"
                            params={{ patientId: row.id! }}
                            className="hover:underline"
                          >
                            {row.patient_code}
                          </Link>
                        </TableCell>
                        <TableCell>{row.full_name ?? "—"}</TableCell>
                        <TableCell>{row.age ?? "—"}</TableCell>
                        <TableCell>{humanize(row.sex)}</TableCell>
                        <TableCell className="max-w-56 truncate" title={row.conditions_text ?? ""}>
                          {row.conditions_text || row.primary_condition || "—"}
                        </TableCell>
                        <TableCell>{formatNumber(row.hba1c)}</TableCell>
                        <TableCell>{formatNumber(row.bmi)}</TableCell>
                        <TableCell>{formatNumber(row.egfr, 0)}</TableCell>
                        <TableCell>
                          <VerificationBadge
                            status={(row.verification_status as VerificationStatus) ?? "UNVERIFIED"}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(row.created_at)}
                        </TableCell>
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
                                    to: "/patients/$patientId",
                                    params: { patientId: row.id! },
                                  })
                                }
                              >
                                <Eye className="size-4" /> View
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!canManage}
                                onSelect={() => openEdit(row.id!)}
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

      <PatientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        patient={editing}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["patients"] })}
      />

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.patient_code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the patient along with their conditions, medications,
              measurements and documents. This cannot be undone.
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
              {deleteMutation.isPending ? "Deleting…" : "Delete patient"}
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

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", verificationTone[status])}>
      {humanize(status)}
    </Badge>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center",
        className,
      )}
    >
      <h3 className="text-sm font-semibold">We couldn't load this data</h3>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw className="size-4" /> Try again
      </Button>
    </div>
  );
}

function EmptyState({
  hasFilters,
  canManage,
  onClear,
  onAdd,
}: {
  hasFilters: boolean;
  canManage: boolean;
  onClear: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Users className="size-5" />
      </span>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          {hasFilters ? "No patients match these filters" : "No patients yet"}
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          {hasFilters
            ? "Try a different search term or clear the filters to see the full registry."
            : "Add the first patient record to start building your research cohort."}
        </p>
      </div>
      {hasFilters ? (
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      ) : (
        <Button size="sm" onClick={onAdd} disabled={!canManage}>
          <Plus className="size-4" /> Add patient
        </Button>
      )}
    </div>
  );
}
