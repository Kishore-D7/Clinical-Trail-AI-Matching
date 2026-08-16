import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import {
  humanize,
  patientSchema,
  SEX_OPTIONS,
  type PatientFormValues,
  type PatientRow,
} from "@/lib/patients";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: PatientRow | null;
  onSaved?: (patientId: string) => void;
};

const emptyValues: PatientFormValues = {
  patient_code: "",
  full_name: "",
  sex: "UNKNOWN",
  date_of_birth: "",
  age: "",
  primary_condition: "",
  status: "ACTIVE",
};

export function PatientFormDialog({ open, onOpenChange, patient, onSaved }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(patient);

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: emptyValues,
    mode: "onBlur",
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      patient
        ? {
            patient_code: patient.patient_code,
            full_name: patient.full_name ?? "",
            sex: (SEX_OPTIONS as readonly string[]).includes(patient.sex ?? "")
              ? (patient.sex as PatientFormValues["sex"])
              : "UNKNOWN",
            date_of_birth: patient.date_of_birth ?? "",
            age: patient.age != null ? String(patient.age) : "",
            primary_condition: patient.primary_condition ?? "",
            status: (patient.status as PatientFormValues["status"]) ?? "ACTIVE",
          }
        : emptyValues,
    );
  }, [open, patient, form]);

  const mutation = useMutation({
    mutationFn: async (values: PatientFormValues) => {
      const payload = {
        patient_code: values.patient_code,
        full_name: values.full_name,
        sex: values.sex,
        date_of_birth: values.date_of_birth ? values.date_of_birth : null,
        age: values.age ? Number(values.age) : null,
        primary_condition: values.primary_condition || null,
        status: values.status,
      };

      if (patient) {
        const { data, error } = await supabase
          .from("patients")
          .update(payload)
          .eq("id", patient.id)
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      }

      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("patients")
        .insert({ ...payload, created_by: userData.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success(isEdit ? "Patient updated" : "Patient created");
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["patient", id] });
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (error: { message?: string; code?: string }) => {
      if (error.code === "23505") {
        form.setError("patient_code", { message: "This Patient ID is already in use" });
        return;
      }
      if (error.code === "42501") {
        toast.error("You do not have permission to change patient records.");
        return;
      }
      toast.error(error.message ?? "Could not save the patient");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit patient" : "Add patient"}</DialogTitle>
          <DialogDescription>
            De-identified demographics only. Clinical values are managed on the patient profile.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="patient_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patient ID</FormLabel>
                    <FormControl>
                      <Input placeholder="PT-0001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Study participant name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sex</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SEX_OPTIONS.map((option) => (
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Record status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {["ACTIVE", "INACTIVE", "ARCHIVED"].map((option) => (
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
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of birth</FormLabel>
                    <FormControl>
                      <Input type="date" max={new Date().toISOString().slice(0, 10)} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Age</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="58" {...field} />
                    </FormControl>
                    <FormDescription>Calculated automatically from date of birth.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="primary_condition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary condition</FormLabel>
                  <FormControl>
                    <Input placeholder="Type 2 Diabetes" {...field} />
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
                {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create patient"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
