import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FileUp, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  CriterionFields,
  emptyCriterion,
  useCriterionForm,
} from "@/components/trials/criterion-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractionResult } from "@/lib/ai-criteria";
import {
  confirmExtractedCriteria,
  discardExtraction,
  extractTrialCriteria,
} from "@/lib/ai-criteria.functions";
import { ACCEPTED_EXTRACTION_TYPES, extractTextFromFile } from "@/lib/document-text";
import { criterionExpression, humanizeType, type CriterionFormValues } from "@/lib/trials";
import { cn } from "@/lib/utils";

export function AiExtractCriteriaDialog({
  open,
  onOpenChange,
  trialId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trialId: string;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"TEXT" | "FILE">("TEXT");
  const [parsingFile, setParsingFile] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [rows, setRows] = useState<CriterionFormValues[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const editorForm = useCriterionForm();

  const runExtract = useServerFn(extractTrialCriteria);
  const runConfirm = useServerFn(confirmExtractedCriteria);
  const runDiscard = useServerFn(discardExtraction);

  useEffect(() => {
    if (open) return;
    setText("");
    setSourceName(null);
    setSourceType("TEXT");
    setResult(null);
    setRows([]);
    setEditingIndex(null);
    setEditorOpen(false);
  }, [open]);

  const extraction = useMutation({
    mutationFn: async () =>
      runExtract({
        data: {
          trialId,
          text,
          sourceType,
          sourceName: sourceName ?? undefined,
        },
      }),
    onSuccess: (data) => {
      setResult(data);
      setRows(data.criteria);
      if (data.criteria.length === 0) toast.warning("No criteria could be extracted from that text.");
    },
    onError: (error: Error) => toast.error(error.message ?? "Extraction failed"),
  });

  const confirmation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("Nothing to confirm");
      return runConfirm({
        data: {
          extractionId: result.extractionId,
          trialId,
          criteria: rows.map((r) => ({
            criterion_type: r.criterion_type,
            field: r.field,
            operator: r.operator,
            value: r.value,
            value_secondary: r.value_secondary || undefined,
            unit: r.unit || undefined,
            description: r.description || undefined,
            required: r.required,
          })),
        },
      });
    },
    onSuccess: (data) => {
      toast.success(`${data.inserted} criteria saved to the trial`);
      queryClient.invalidateQueries({ queryKey: ["trial-criteria", trialId] });
      queryClient.invalidateQueries({ queryKey: ["trial-extractions", trialId] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message ?? "Could not save criteria"),
  });

  async function handleFile(file: File) {
    setParsingFile(true);
    try {
      const extracted = await extractTextFromFile(file);
      if (!extracted.trim()) throw new Error("No readable text found in that file.");
      setText(extracted);
      setSourceName(file.name);
      setSourceType("FILE");
      toast.success(`Loaded text from ${file.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that file");
    } finally {
      setParsingFile(false);
    }
  }

  function openEditor(index: number | null) {
    setEditingIndex(index);
    editorForm.reset(index === null ? emptyCriterion : rows[index]);
    setEditorOpen(true);
  }

  function saveEditor(values: CriterionFormValues) {
    setRows((prev) =>
      editingIndex === null
        ? [...prev, values]
        : prev.map((row, i) => (i === editingIndex ? values : row)),
    );
    setEditorOpen(false);
  }

  function handleClose(next: boolean) {
    if (!next && result && !confirmation.isSuccess) {
      void runDiscard({ data: { extractionId: result.extractionId } }).catch(() => undefined);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> AI extract criteria
          </DialogTitle>
          <DialogDescription>
            Paste or upload eligibility text. AI proposes structured criteria — nothing is saved
            until you confirm.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <Tabs value={sourceType === "FILE" ? "upload" : "paste"}>
              <TabsList>
                <TabsTrigger value="paste" onClick={() => setSourceType("TEXT")}>
                  Paste text
                </TabsTrigger>
                <TabsTrigger value="upload" onClick={() => setSourceType("FILE")}>
                  Upload document
                </TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="mt-3">
                <Textarea
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setSourceName(null);
                  }}
                  rows={12}
                  placeholder="Inclusion criteria: Adults aged 18 years or older with HbA1c ≥ 7.0%…"
                />
              </TabsContent>

              <TabsContent value="upload" className="mt-3 space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTRACTION_TYPES}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={parsingFile}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {parsingFile ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FileUp className="size-4" />
                  )}
                  {parsingFile ? "Reading document…" : "Choose PDF, DOCX or TXT"}
                </Button>
                {sourceName ? (
                  <p className="text-sm text-muted-foreground">
                    Loaded <span className="font-medium text-foreground">{sourceName}</span> —{" "}
                    {text.length.toLocaleString()} characters of text.
                  </p>
                ) : null}
                {text && sourceType === "FILE" ? (
                  <Textarea value={text} rows={8} onChange={(e) => setText(e.target.value)} />
                ) : null}
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={extraction.isPending || text.trim().length < 20}
                onClick={() => extraction.mutate()}
              >
                {extraction.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {extraction.isPending ? "Extracting…" : "Extract criteria"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">Provider: {result.provider}</Badge>
              <Badge variant="outline">Model: {result.model}</Badge>
              {result.isMock ? (
                <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="size-3" /> Mock development data
                </Badge>
              ) : null}
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Original text {sourceName ? `· ${sourceName}` : ""}
              </p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {text}
              </pre>
            </div>

            {result.notes.length > 0 ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                <p className="mb-1 font-medium">Missing or ambiguous</p>
                <ul className="list-disc space-y-1 pl-4">
                  {result.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Review criteria ({rows.length})
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => openEditor(null)}>
                <Plus className="size-4" /> Add criterion
              </Button>
            </div>

            {rows.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No criteria to review. Add one manually or go back and try different text.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Criterion</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, index) => (
                      <TableRow key={`${row.field}-${index}`}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              row.criterion_type === "INCLUSION"
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border-destructive/40 bg-destructive/10 text-destructive",
                            )}
                          >
                            {humanizeType(row.criterion_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{criterionExpression(row)}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground">
                          {row.description || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Edit criterion"
                              onClick={() => openEditor(index)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Remove criterion"
                              onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setRows([]);
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={confirmation.isPending || rows.length === 0}
                onClick={() => confirmation.mutate()}
              >
                {confirmation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Confirm all ({rows.length})
              </Button>
            </DialogFooter>
          </div>
        )}

        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingIndex === null ? "Add criterion" : "Edit criterion"}</DialogTitle>
              <DialogDescription>
                Adjust the extracted rule before it is saved to the trial.
              </DialogDescription>
            </DialogHeader>
            <CriterionFields
              form={editorForm}
              submitLabel={editingIndex === null ? "Add" : "Save"}
              onCancel={() => setEditorOpen(false)}
              onSubmit={saveEditor}
            />
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
