import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  CRITERION_FIELD_SUGGESTIONS,
  CRITERION_OPERATORS,
  CRITERION_TYPES,
  criterionSchema,
  humanizeType,
  type CriterionFormValues,
} from "@/lib/trials";

export const emptyCriterion: CriterionFormValues = {
  criterion_type: "INCLUSION",
  field: "",
  operator: "=",
  value: "",
  value_secondary: "",
  unit: "",
  description: "",
  required: true,
};

export function useCriterionForm(defaults: CriterionFormValues = emptyCriterion) {
  return useForm<CriterionFormValues>({
    resolver: zodResolver(criterionSchema),
    defaultValues: defaults,
    mode: "onBlur",
  });
}

export function CriterionFields({
  form,
  onSubmit,
  submitLabel,
  pending,
  onCancel,
}: {
  form: ReturnType<typeof useCriterionForm>;
  onSubmit: (values: CriterionFormValues) => void;
  submitLabel: string;
  pending?: boolean;
  onCancel?: () => void;
}) {
  const operator = form.watch("operator");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="criterion_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CRITERION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {humanizeType(type)}
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
            name="field"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Field</FormLabel>
                <FormControl>
                  <Input list="criterion-field-options" placeholder="e.g. HbA1c" {...field} />
                </FormControl>
                <datalist id="criterion-field-options">
                  {CRITERION_FIELD_SUGGESTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="operator"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Operator</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CRITERION_OPERATORS.map((op) => (
                      <SelectItem key={op} value={op}>
                        {op}
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
            name="unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. % or mL/min" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{operator === "BETWEEN" ? "Lower value" : "Value"}</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. 18" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {operator === "BETWEEN" ? (
            <FormField
              control={form.control}
              name="value_secondary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Upper value</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 65" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder="Optional protocol note" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="required"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-3 rounded-md border p-3">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              </FormControl>
              <div className="space-y-0.5">
                <FormLabel className="cursor-pointer">Required criterion</FormLabel>
                <FormDescription>Mandatory rules block matching when unmet.</FormDescription>
              </div>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
