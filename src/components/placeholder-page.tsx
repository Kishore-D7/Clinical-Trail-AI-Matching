import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader className="items-start gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Icon className="size-5" />
          </span>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">{title}</CardTitle>
              <Badge variant="outline">Coming soon</Badge>
            </div>
            <CardDescription>{description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This module is part of the platform roadmap. The foundation — authentication, roles,
            navigation and the data model — is in place, so this screen can be filled in next.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
