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
  CONDITION_STATUS_OPTIONS,
  conditionSchema,
  humanize,
  type ConditionRow,
} from "@/lib/patients";

type Values = z.infer<typeof conditionSchema>;

const emptyValues: Values = { name: "", status: "ACTIVE", diagnosed_on: "", notes: "" };

export function ConditionDialog({
  open,
  onOpenChange,
  patientId,
  condition,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  condition?: ConditionRow | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(condition);

  const form = useForm<Values>({
    resolver: zodResolver(conditionSchema),
    defaultValues: emptyValues,
    mode: "onBlur",
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      condition
        ? {
            name: condition.name,
            status: (CONDITION_STATUS_OPTIONS as readonly string[]).includes(condition.status)
              ? (condition.status as Values["status"])
              : "ACTIVE",
            diagnosed_on: condition.diagnosed_on ?? "",
            notes: condition.notes ?? "",
          }
        : emptyValues,
    );
  }, [open, condition, form]);

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      const payload = {
        patient_id: patientId,
        name: values.name,
        status: values.status,
        diagnosed_on: values.diagnosed_on ? values.diagnosed_on : null,
        notes: values.notes || null,
      };
      if (condition) {
        const { error } = await supabase
          .from("patient_conditions")
          .update(payload)
          .eq("id", condition.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("patient_conditions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Condition updated" : "Condition added");
      queryClient.invalidateQueries({ queryKey: ["patient-conditions", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      onOpenChange(false);
    },
    onError: (error: { message?: string; code?: string }) => {
      toast.error(
        error.code === "42501"
          ? "You do not have permission to change conditions."
          : (error.message ?? "Could not save the condition"),
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit condition" : "Add condition"}</DialogTitle>
          <DialogDescription>Conditions drive trial eligibility screening.</DialogDescription>
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
                  <FormLabel>Condition</FormLabel>
                  <FormControl>
                    <Input placeholder="Type 2 Diabetes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
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
                        {CONDITION_STATUS_OPTIONS.map((option) => (
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
                name="diagnosed_on"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Diagnosed on</FormLabel>
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
                    <Textarea rows={3} placeholder="Optional clinical context" {...field} />
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
                {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Add condition"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
