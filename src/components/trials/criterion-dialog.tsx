import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import {
  CriterionFields,
  emptyCriterion,
  useCriterionForm,
} from "@/components/trials/criterion-fields";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { CriterionFormValues, CriterionRow } from "@/lib/trials";

export function CriterionDialog({
  open,
  onOpenChange,
  trialId,
  criterion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trialId: string;
  criterion?: CriterionRow | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(criterion);
  const form = useCriterionForm();

  useEffect(() => {
    if (!open) return;
    form.reset(
      criterion
        ? {
            criterion_type: criterion.criterion_type,
            field: criterion.field,
            operator: criterion.operator as CriterionFormValues["operator"],
            value: criterion.value,
            value_secondary: criterion.value_secondary ?? "",
            unit: criterion.unit ?? "",
            description: criterion.description ?? "",
            required: criterion.required,
          }
        : emptyCriterion,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, criterion]);

  const mutation = useMutation({
    mutationFn: async (values: CriterionFormValues) => {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        trial_id: trialId,
        criterion_type: values.criterion_type,
        field: values.field,
        operator: values.operator,
        value: values.value,
        value_secondary: values.value_secondary || null,
        unit: values.unit || null,
        description: values.description || null,
        required: values.required,
      };
      if (criterion) {
        const { error } = await supabase
          .from("trial_criteria")
          .update(payload)
          .eq("id", criterion.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("trial_criteria")
        .insert({ ...payload, created_by: userData.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Criterion updated" : "Criterion added");
      queryClient.invalidateQueries({ queryKey: ["trial-criteria", trialId] });
      onOpenChange(false);
    },
    onError: (error: { message?: string; code?: string }) => {
      toast.error(
        error.code === "42501"
          ? "You do not have permission to manage criteria."
          : (error.message ?? "Could not save the criterion"),
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit criterion" : "Add criterion"}</DialogTitle>
          <DialogDescription>
            Define an inclusion or exclusion rule used to screen patients for this trial.
          </DialogDescription>
        </DialogHeader>
        <CriterionFields
          form={form}
          submitLabel={isEdit ? "Save changes" : "Add criterion"}
          pending={mutation.isPending}
          onCancel={() => onOpenChange(false)}
          onSubmit={(values) => mutation.mutate(values)}
        />
      </DialogContent>
    </Dialog>
  );
}
