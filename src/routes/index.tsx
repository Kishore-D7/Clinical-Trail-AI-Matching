import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, FlaskConical, ShieldCheck, Sparkles, Stethoscope, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TrialBridge — Clinical Trial Matching & Research Assistant" },
      {
        name: "description",
        content:
          "A secure workspace for research teams to manage patient cohorts, clinical trial catalogues and eligibility review in one place.",
      },
      { property: "og:title", content: "TrialBridge — Clinical Trial Matching" },
      {
        property: "og:description",
        content:
          "Manage patient cohorts, trial catalogues and eligibility review in one secure research workspace.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Users,
    title: "Patient registry",
    body: "Keep de-identified cohorts organised with structured intake and review states.",
  },
  {
    icon: FlaskConical,
    title: "Trial catalogue",
    body: "Track protocols, phases, sponsors and recruitment status in one place.",
  },
  {
    icon: Sparkles,
    title: "Eligibility matching",
    body: "Surface candidate matches and route them to coordinators for adjudication.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    body: "Researchers, clinical coordinators and administrators each see the right controls.",
  },
];

function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <span className="flex items-center gap-2.5 font-semibold">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Stethoscope className="size-5" />
            </span>
            TrialBridge
          </span>
          {signedIn ? (
            <Button asChild>
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </header>

      <main>
        <section className="hero-gradient text-sidebar-foreground">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <p className="inline-flex items-center gap-2 rounded-full bg-sidebar-accent px-3 py-1 text-xs text-sidebar-accent-foreground">
              <Activity className="size-3.5" /> Clinical research operations platform
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Clinical Trial Matching &amp; Research Assistant
            </h1>
            <p className="mt-4 max-w-2xl text-sidebar-foreground/75">
              Bring patient records, trial protocols and eligibility review into a single auditable
              workspace built for research teams and clinical coordinators.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to={signedIn ? "/dashboard" : "/auth"}>
                  {signedIn ? "Open workspace" : "Get started"}
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Built for research operations</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title} className="shadow-[var(--shadow-card)]">
                <CardHeader>
                  <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    <feature.icon className="size-5" />
                  </span>
                  <CardTitle className="mt-3 text-base">{feature.title}</CardTitle>
                  <CardDescription>{feature.body}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-5 py-6 text-sm text-muted-foreground">
          TrialBridge — clinical trial matching and research assistant.
        </div>
      </footer>
    </div>
  );
}
