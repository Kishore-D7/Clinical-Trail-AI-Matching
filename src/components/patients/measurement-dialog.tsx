import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  METRICS,
  formatNumber,
  measurementSchema,
  metricMeta,
  type MeasurementMetric,
  type MeasurementRow,
  type PatientDocumentRow,
} from "@/lib/patients";

export type MeasurementDialogMode = "add" | "edit" | "verify" | "correct";

type Values = {
  value: string;
  unit: string;
  measured_on: string;
  source_page: string;
  source_document_id: string;
  notes: string;
};

const NO_DOCUMENT = "__none__";

const titles: Record<MeasurementDialogMode, string> = {
  add: "Add measurement",
  edit: "Edit measurement",
  verify: "Verify measurement",
  correct: "Correct measurement",
};

const descriptions: Record<MeasurementDialogMode, string> = {
  add: "Record a manually captured clinical value.",
  edit: "Update the recorded value and its provenance.",
  verify: "Confirm the extracted value is accurate as recorded.",
  correct: "Save a corrected value. The original AI value is always preserved.",
};

export function MeasurementDialog({
  open,
  onOpenChange,
  patientId,
  metric,
  measurement,
  mode,
  documents,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  metric: MeasurementMetric;
  measurement?: MeasurementRow | null;
  mode: MeasurementDialogMode;
  documents: PatientDocumentRow[];
  userId: string | null;
}) {
  const queryClient = useQueryClient();
  const meta = metricMeta(metric);
  const schema = useMemo(() => measurementSchema(metric), [metric]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      value: "",
      unit: meta.unit,
      measured_on: "",
      source_page: "",
      source_document_id: NO_DOCUMENT,
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      value: measurement ? String(measurement.value) : "",
      unit: measurement?.unit ?? meta.unit,
      measured_on: measurement?.measured_on ?? "",
      source_page: measurement?.source_page ? String(measurement.source_page) : "",
      source_document_id: measurement?.source_document_id ?? NO_DOCUMENT,
      notes: measurement?.notes ?? "",
    });
  }, [open, measurement, meta.unit, form]);

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      const numericValue = Number(values.value);
      const documentId =
        values.source_document_id && values.source_document_id !== NO_DOCUMENT
          ? values.source_document_id
          : null;

      if (mode === "verify" && measurement) {
        const { error } = await supabase
          .from("patient_measurements")
          .update({
            verification_status: "VERIFIED",
            verified_by: userId,
            verified_at: new Date().toISOString(),
          })
          .eq("id", measurement.id);
        if (error) throw error;
        return;
      }

      const base = {
        value: numericValue,
        unit: values.unit || meta.unit,
        measured_on: values.measured_on ? values.measured_on : null,
        source_page: values.source_page ? Number(values.source_page) : null,
        source_document_id: documentId,
        notes: values.notes || null,
      };

      if (measurement) {
        // Never overwrite original_value: keep the first AI-extracted value forever.
        const preservedOriginal =
          measurement.original_value ??
          (measurement.source === "AI" ? measurement.value : null);

        const isCorrection = mode === "correct" || numericValue !== measurement.value;

        const { error } = await supabase
          .from("patient_measurements")
          .update({
            ...base,
            original_value: preservedOriginal,
            verification_status: isCorrection ? "CORRECTED" : measurement.verification_status,
            verified_by: isCorrection ? userId : measurement.verified_by,
            verified_at: isCorrection ? new Date().toISOString() : measurement.verified_at,
          })
          .eq("id", measurement.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("patient_measurements").insert({
        ...base,
        patient_id: patientId,
        metric,
        source: "MANUAL",
        verification_status: "VERIFIED",
        verified_by: userId,
        verified_at: new Date().toISOString(),
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        mode === "verify"
          ? "Measurement verified"
          : mode === "correct"
            ? "Correction saved"
            : mode === "edit"
              ? "Measurement updated"
              : "Measurement added",
      );
      queryClient.invalidateQueries({ queryKey: ["patient-measurements", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      onOpenChange(false);
    },
    onError: (error: { message?: string; code?: string }) => {
      toast.error(
        error.code === "42501"
          ? "You do not have permission to change measurements."
          : (error.message ?? "Could not save the measurement"),
      );
    },
  });

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? meta.label;
  const readOnly = mode === "verify";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {titles[mode]} — {metricLabel}
          </DialogTitle>
          <DialogDescription>{descriptions[mode]}</DialogDescription>
        </DialogHeader>

        {measurement && measurement.original_value !== null && (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Original AI value: {formatNumber(measurement.original_value, 2)} {measurement.unit}
          </p>
        )}

        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step={meta.step}
                        readOnly={readOnly}
                        placeholder={`${meta.min}–${meta.max}`}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Expected range {meta.min}–{meta.max} {meta.unit}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input readOnly={readOnly} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="measured_on"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Measured on</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        readOnly={readOnly}
                        max={new Date().toISOString().slice(0, 10)}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="source_page"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source page</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} readOnly={readOnly} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="source_document_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source document</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || NO_DOCUMENT}
                    disabled={readOnly}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="No source document" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_DOCUMENT}>No source document</SelectItem>
                      {documents.map((doc) => (
                        <SelectItem key={doc.id} value={doc.id}>
                          {doc.file_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Optional notes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending
                  ? "Saving…"
                  : mode === "verify"
                    ? "Mark verified"
                    : mode === "correct"
                      ? "Save correction"
                      : mode === "edit"
                        ? "Save changes"
                        : "Add measurement"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
