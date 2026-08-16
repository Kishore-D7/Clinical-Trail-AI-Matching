import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { CriterionFields, emptyCriterion, useCriterionForm } from "@/components/trials/criterion-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  criterionExpression,
  humanizeType,
  phaseLabel,
  TRIAL_PHASES,
  TRIAL_STATUSES,
  trialSchema,
  type CriterionFormValues,
  type CriterionRow,
  type TrialFormValues,
  type TrialRow,
} from "@/lib/trials";
import { humanize } from "@/lib/patients";
import { cn } from "@/lib/utils";

const STEPS = ["Basics", "Eligibility", "Review", "Save"];

const emptyTrial: TrialFormValues = {
  trial_code: "",
  title: "",
  description: "",
  sponsor: "",
  phase: "PHASE_2",
  condition: "",
  location: "",
  status: "DRAFT",
  nct_id: "",
  start_date: "",
  end_date: "",
};

export function TrialFormDialog({
  open,
  onOpenChange,
  trial,
  criteria,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trial?: TrialRow | null;
  criteria?: CriterionRow[];
  onSaved?: (trialId: string) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(trial);
  const [step, setStep] = useState(0);
  const [draftCriteria, setDraftCriteria] = useState<CriterionFormValues[]>([]);
  const [showCriterionForm, setShowCriterionForm] = useState(false);

  const form = useForm<TrialFormValues>({
    resolver: zodResolver(trialSchema),
    defaultValues: emptyTrial,
    mode: "onBlur",
  });

  const criterionForm = useCriterionForm();

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setShowCriterionForm(false);
    criterionForm.reset(emptyCriterion);
    form.reset(
      trial
        ? {
            trial_code: trial.trial_code,
            title: trial.title,
            description: trial.description ?? "",
            sponsor: trial.sponsor ?? "",
            phase: (TRIAL_PHASES as readonly string[]).includes(trial.phase ?? "")
              ? (trial.phase as TrialFormValues["phase"])
              : "NA",
            condition: trial.condition ?? "",
            location: trial.location ?? "",
            status: trial.status,
            nct_id: trial.nct_id ?? "",
            start_date: trial.start_date ?? "",
            end_date: trial.end_date ?? "",
          }
        : emptyTrial,
    );
    setDraftCriteria(
      (criteria ?? []).map((c) => ({
        criterion_type: c.criterion_type,
        field: c.field,
        operator: c.operator as CriterionFormValues["operator"],
        value: c.value,
        value_secondary: c.value_secondary ?? "",
        unit: c.unit ?? "",
        description: c.description ?? "",
        required: c.required,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trial, criteria]);

  const mutation = useMutation({
    mutationFn: async (values: TrialFormValues) => {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        trial_code: values.trial_code,
        title: values.title,
        description: values.description || null,
        sponsor: values.sponsor || null,
        phase: values.phase,
        condition: values.condition || null,
        location: values.location || null,
        status: values.status,
        nct_id: values.nct_id || null,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
      };

      let trialId = trial?.id ?? "";
      if (trial) {
        const { error } = await supabase.from("clinical_trials").update(payload).eq("id", trial.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("clinical_trials")
          .insert({ ...payload, created_by: userData.user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        trialId = data.id;
      }

      if (trial) {
        const { error: delError } = await supabase
          .from("trial_criteria")
          .delete()
          .eq("trial_id", trialId);
        if (delError) throw delError;
      }

      if (draftCriteria.length > 0) {
        const { error } = await supabase.from("trial_criteria").insert(
          draftCriteria.map((c) => ({
            trial_id: trialId,
            criterion_type: c.criterion_type,
            field: c.field,
            operator: c.operator,
            value: c.value,
            value_secondary: c.value_secondary || null,
            unit: c.unit || null,
            description: c.description || null,
            required: c.required,
            created_by: userData.user?.id ?? null,
          })),
        );
        if (error) throw error;
      }

      return trialId;
    },
    onSuccess: (trialId) => {
      toast.success(isEdit ? "Trial updated" : "Trial created");
      queryClient.invalidateQueries({ queryKey: ["trials"] });
      queryClient.invalidateQueries({ queryKey: ["trial", trialId] });
      queryClient.invalidateQueries({ queryKey: ["trial-criteria", trialId] });
      onSaved?.(trialId);
      onOpenChange(false);
    },
    onError: (error: { message?: string; code?: string }) => {
      if (error.code === "23505") {
        toast.error("That trial code is already in use.");
        setStep(0);
        return;
      }
      toast.error(
        error.code === "42501"
          ? "You do not have permission to manage trials."
          : (error.message ?? "Could not save the trial"),
      );
    },
  });

  const values = form.getValues();

  async function next() {
    if (step === 0) {
      const valid = await form.trigger();
      if (!valid) return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit trial" : "New clinical trial"}</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap items-center gap-2 text-xs">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                index === step
                  ? "border-primary bg-primary/10 text-primary"
                  : index < step
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground",
              )}
            >
              {index < step ? <Check className="size-3" /> : <span>{index + 1}</span>}
              {label}
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <Form {...form}>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
              <FormField
                control={form.control}
                name="trial_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trial code</FormLabel>
                    <FormControl>
                      <Input placeholder="TR-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nct_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NCT ID</FormLabel>
                    <FormControl>
                      <Input placeholder="NCT01234567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Trial name</FormLabel>
                    <FormControl>
                      <Input placeholder="Trial title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Protocol summary" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sponsor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sponsor</FormLabel>
                    <FormControl>
                      <Input placeholder="Sponsor organisation" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phase"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phase</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRIAL_PHASES.map((phase) => (
                          <SelectItem key={phase} value={phase}>
                            {phaseLabel(phase)}
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
                name="condition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condition</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Type 2 Diabetes" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Site or city" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRIAL_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {humanize(status)}
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
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            {draftCriteria.length === 0 ? (
              <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No eligibility criteria yet. Add inclusion and exclusion rules, or continue and add
                them later.
              </p>
            ) : (
              <ul className="space-y-2">
                {draftCriteria.map((criterion, index) => (
                  <li
                    key={`${criterion.field}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{humanizeType(criterion.criterion_type)}</Badge>
                        <span className="font-medium">{criterionExpression(criterion)}</span>
                        {!criterion.required ? (
                          <Badge variant="secondary">Optional</Badge>
                        ) : null}
                      </div>
                      {criterion.description ? (
                        <p className="text-xs text-muted-foreground">{criterion.description}</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove criterion"
                      onClick={() =>
                        setDraftCriteria((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {showCriterionForm ? (
              <div className="rounded-md border p-3">
                <CriterionFields
                  form={criterionForm}
                  submitLabel="Add criterion"
                  onCancel={() => {
                    setShowCriterionForm(false);
                    criterionForm.reset(emptyCriterion);
                  }}
                  onSubmit={(criterion) => {
                    setDraftCriteria((prev) => [...prev, criterion]);
                    criterionForm.reset(emptyCriterion);
                    setShowCriterionForm(false);
                  }}
                />
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => setShowCriterionForm(true)}>
                <Plus className="size-4" /> Add criterion
              </Button>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Trial code" value={values.trial_code} />
              <Field label="NCT ID" value={values.nct_id || "—"} />
              <Field label="Trial name" value={values.title} className="sm:col-span-2" />
              <Field label="Sponsor" value={values.sponsor || "—"} />
              <Field label="Phase" value={phaseLabel(values.phase)} />
              <Field label="Condition" value={values.condition || "—"} />
              <Field label="Location" value={values.location || "—"} />
              <Field label="Status" value={humanize(values.status)} />
              <Field
                label="Duration"
                value={`${values.start_date || "—"} → ${values.end_date || "—"}`}
              />
              <Field
                label="Description"
                value={values.description || "—"}
                className="sm:col-span-2"
              />
            </dl>
            <Separator />
            <div className="space-y-2">
              <p className="font-medium">Eligibility criteria ({draftCriteria.length})</p>
              {draftCriteria.length === 0 ? (
                <p className="text-muted-foreground">No criteria defined.</p>
              ) : (
                <ul className="space-y-1 text-muted-foreground">
                  {draftCriteria.map((criterion, index) => (
                    <li key={index}>
                      <span className="font-medium text-foreground">
                        {humanizeType(criterion.criterion_type)}
                      </span>{" "}
                      — {criterionExpression(criterion)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            {mutation.isPending ? (
              <Loader2 className="size-6 animate-spin text-primary" />
            ) : (
              <Check className="size-6 text-primary" />
            )}
            <p className="text-sm text-muted-foreground">
              {mutation.isPending
                ? "Saving the trial and its eligibility criteria…"
                : `Ready to ${isEdit ? "update" : "create"} “${values.title || values.trial_code}” with ${draftCriteria.length} criteria.`}
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0 || mutation.isPending}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next}>
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(form.getValues())}
              >
                {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create trial"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
