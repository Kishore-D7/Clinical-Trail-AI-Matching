import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

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
  MEDICATION_STATUS_OPTIONS,
  humanize,
  medicationSchema,
  type MedicationRow,
} from "@/lib/patients";

type Values = z.infer<typeof medicationSchema>;

const emptyValues: Values = {
  name: "",
  dosage: "",
  frequency: "",
  status: "ACTIVE",
  started_on: "",
  notes: "",
};

export function MedicationDialog({
  open,
  onOpenChange,
  patientId,
  medication,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  medication?: MedicationRow | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(medication);

  const form = useForm<Values>({
    resolver: zodResolver(medicationSchema),
    defaultValues: emptyValues,
    mode: "onBlur",
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      medication
        ? {
            name: medication.name,
            dosage: medication.dosage ?? "",
            frequency: medication.frequency ?? "",
            status: (MEDICATION_STATUS_OPTIONS as readonly string[]).includes(medication.status)
              ? (medication.status as Values["status"])
              : "ACTIVE",
            started_on: medication.started_on ?? "",
            notes: medication.notes ?? "",
          }
        : emptyValues,
    );
  }, [open, medication, form]);

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      const payload = {
        patient_id: patientId,
        name: values.name,
        dosage: values.dosage || null,
        frequency: values.frequency || null,
        status: values.status,
        started_on: values.started_on ? values.started_on : null,
        notes: values.notes || null,
      };
      if (medication) {
        const { error } = await supabase
          .from("patient_medications")
          .update(payload)
          .eq("id", medication.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("patient_medications").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Medication updated" : "Medication added");
      queryClient.invalidateQueries({ queryKey: ["patient-medications", patientId] });
      onOpenChange(false);
    },
    onError: (error: { message?: string; code?: string }) => {
      toast.error(
        error.code === "42501"
          ? "You do not have permission to change medications."
          : (error.message ?? "Could not save the medication"),
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit medication" : "Add medication"}</DialogTitle>
          <DialogDescription>Current and past therapies for this participant.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Medication</FormLabel>
                  <FormControl>
                    <Input placeholder="Metformin" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dosage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dosage</FormLabel>
                    <FormControl>
                      <Input placeholder="500 mg" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <FormControl>
                      <Input placeholder="Twice daily" {...field} />
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MEDICATION_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {humanize(option)}
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
                name="started_on"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Started on</FormLabel>
                    <FormControl>
                      <Input type="date" max={new Date().toISOString().slice(0, 10)} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
                {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Add medication"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
