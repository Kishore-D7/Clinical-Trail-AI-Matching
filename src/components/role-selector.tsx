import { Check, ShieldCheck } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { APP_ROLES, roleDescriptions, roleLabels, type AppRole } from "@/lib/roles";

type Props = {
  value: AppRole | null;
  onChange: (role: AppRole) => void;
  /** Roles offered; defaults to all three. */
  roles?: AppRole[];
  error?: string | null;
  label?: string;
};

export function RoleSelector({ value, onChange, roles = APP_ROLES, error, label }: Props) {
  return (
    <fieldset className="space-y-3">
      <Label asChild>
        <legend className="text-sm font-medium">{label ?? "Select your role"}</legend>
      </Label>
      <div className="grid gap-2.5" role="radiogroup" aria-required="true">
        {roles.map((role) => {
          const selected = value === role;
          return (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(role)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/50 hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {selected && <Check className="size-3" />}
              </span>
              <span className="min-w-0 space-y-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {roleLabels[role]}
                  {role === "ADMIN" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                      <ShieldCheck className="size-3" /> Requires approval
                    </span>
                  )}
                </span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  {roleDescriptions[role]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
