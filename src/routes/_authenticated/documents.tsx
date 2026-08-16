import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Search, Layers } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatNumber } from "@/lib/patients";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents — TrialBridge" },
      {
        name: "description",
        content:
          "Browse patient source documents and bulk PDF processing jobs, with type filters and links to the records they produced.",
      },
      { property: "og:title", content: "Documents — TrialBridge" },
      {
        property: "og:description",
        content:
          "Browse patient source documents and bulk PDF processing jobs, with type filters and links to the records they produced.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type PatientDocument = {
  id: string;
  file_name: string;
  doc_type: string | null;
  page_count: number | null;
  storage_path: string | null;
  created_at: string;
  patient_id: string;
  patients: { patient_code: string; full_name: string | null } | null;
};

type ProcessingJob = {
  id: string;
  file_name: string;
  file_size: number;
  status: string;
  total_pages: number;
  total_patients_detected: number;
  patients_successful: number;
  patients_needs_review: number;
  created_at: string;
};

const JOB_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  COMPLETED: "default",
  PARTIALLY_COMPLETED: "secondary",
  PROCESSING: "secondary",
  QUEUED: "outline",
  UPLOADED: "outline",
  FAILED: "destructive",
};

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <FileText className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function Page() {
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("ALL");

  const documentsQuery = useQuery({
    queryKey: ["patient-documents"],
    queryFn: async (): Promise<PatientDocument[]> => {
      const { data, error } = await supabase
        .from("patient_documents")
        .select(
          "id, file_name, doc_type, page_count, storage_path, created_at, patient_id, patients(patient_code, full_name)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as PatientDocument[];
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["processing-jobs", "documents-page"],
    queryFn: async (): Promise<ProcessingJob[]> => {
      const { data, error } = await supabase
        .from("processing_jobs")
        .select(
          "id, file_name, file_size, status, total_pages, total_patients_detected, patients_successful, patients_needs_review, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ProcessingJob[];
    },
  });

  const docTypes = useMemo(() => {
    const set = new Set<string>();
    for (const d of documentsQuery.data ?? []) if (d.doc_type) set.add(d.doc_type);
    return Array.from(set).sort();
  }, [documentsQuery.data]);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (documentsQuery.data ?? []).filter((d) => {
      const matchesType = docType === "ALL" || d.doc_type === docType;
      const haystack = `${d.file_name} ${d.patients?.patient_code ?? ""} ${d.patients?.full_name ?? ""}`.toLowerCase();
      return matchesType && (!q || haystack.includes(q));
    });
  }, [documentsQuery.data, docType, search]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (jobsQuery.data ?? []).filter((j) => !q || j.file_name.toLowerCase().includes(q));
  }, [jobsQuery.data, search]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Source documents and their processing state.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file name or patient"
            className="pl-9"
            aria-label="Search documents"
          />
        </div>
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="sm:w-56" aria-label="Filter by document type">
            <SelectValue placeholder="All document types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All document types</SelectItem>
            {docTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="patient">
        <TabsList>
          <TabsTrigger value="patient">Patient documents</TabsTrigger>
          <TabsTrigger value="jobs">Bulk PDF jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="patient" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" /> Patient documents
              </CardTitle>
              <CardDescription>
                Files attached to individual patient records in the registry.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {documentsQuery.isLoading ? (
                <TableSkeleton />
              ) : documentsQuery.isError ? (
                <div className="space-y-3 py-8 text-center">
                  <p className="text-sm text-destructive">Could not load documents.</p>
                  <Button variant="outline" size="sm" onClick={() => documentsQuery.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : filteredDocs.length === 0 ? (
                <EmptyState message="No patient documents match your filters yet." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Pages</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocs.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.file_name}</TableCell>
                          <TableCell>
                            {d.patients?.patient_code ?? "—"}
                            {d.patients?.full_name ? (
                              <span className="block text-xs text-muted-foreground">
                                {d.patients.full_name}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {d.doc_type ? <Badge variant="outline">{d.doc_type}</Badge> : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {d.page_count ? formatNumber(d.page_count) : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDateTime(d.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link
                                to="/patients/$patientId"
                                params={{ patientId: d.patient_id }}
                              >
                                View patient
                              </Link>
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

        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="size-4" /> Bulk PDF processing jobs
              </CardTitle>
              <CardDescription>
                Large source PDFs and the extraction results they produced.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobsQuery.isLoading ? (
                <TableSkeleton />
              ) : jobsQuery.isError ? (
                <div className="space-y-3 py-8 text-center">
                  <p className="text-sm text-destructive">Could not load processing jobs.</p>
                  <Button variant="outline" size="sm" onClick={() => jobsQuery.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : filteredJobs.length === 0 ? (
                <EmptyState message="No bulk PDF jobs uploaded yet." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Size</TableHead>
                        <TableHead className="text-right">Pages</TableHead>
                        <TableHead className="text-right">Patients</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredJobs.map((j) => (
                        <TableRow key={j.id}>
                          <TableCell className="font-medium">{j.file_name}</TableCell>
                          <TableCell>
                            <Badge variant={JOB_STATUS_VARIANT[j.status] ?? "outline"}>
                              {j.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatBytes(j.file_size)}</TableCell>
                          <TableCell className="text-right">
                            {j.total_pages ? formatNumber(j.total_pages) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(j.patients_successful)} / {formatNumber(j.total_patients_detected)}
                            {j.patients_needs_review > 0 ? (
                              <span className="block text-xs text-muted-foreground">
                                {formatNumber(j.patients_needs_review)} need review
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDateTime(j.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link
                                to="/patient-processing/$jobId/review"
                                params={{ jobId: j.id }}
                              >
                                Review
                              </Link>
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
      </Tabs>
    </div>
  );
}
