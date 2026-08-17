import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { RoleSelector } from "@/components/role-selector";
import { APP_ROLES, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — TrialBridge Clinical Trial Matching" },
      {
        name: "description",
        content:
          "Sign in or create an account to access the TrialBridge clinical trial matching and research workspace.",
      },
      { property: "og:title", content: "Sign in — TrialBridge" },
      {
        property: "og:description",
        content: "Access the clinical trial matching and research workspace.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "register" && !role) {
      setRoleError("Please select a role to continue.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName,
              requested_role: role === "ADMIN" ? "RESEARCHER" : (role ?? "RESEARCHER"),
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInError) throw signInError;
        }
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hero-gradient relative hidden flex-col justify-between p-10 text-sidebar-foreground lg:flex">
        <Link to="/" className="flex items-center gap-2.5 text-sm font-semibold">
          <span className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Stethoscope className="size-5" />
          </span>
          TrialBridge
        </Link>
        <div className="max-w-md space-y-4">
          <h2 className="text-3xl font-semibold tracking-tight">
            Match patients to the right clinical trial, faster.
          </h2>
          <p className="text-sidebar-foreground/70">
            A secure workspace for research teams and clinical coordinators to manage cohorts,
            trial catalogues and eligibility review in one place.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">
          Role-based access · Audit-ready · Built for research operations
        </p>
      </section>

      <section className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-[var(--shadow-elevated)]">
          <CardHeader>
            <CardTitle className="text-xl">
              {mode === "login" ? "Sign in" : "Create your account"}
            </CardTitle>
            <CardDescription>
              Use your work email to access the research workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1" role="tablist">
              {(["login", "register"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => setMode(value)}
                  className={
                    "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors " +
                    (mode === value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {value === "login" ? "Sign in" : "Register"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Dr. Alex Moreau"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@institute.org"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                {mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogle}
              disabled={loading}
            >
              Continue with Google
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
