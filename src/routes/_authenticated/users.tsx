import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Search, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listManagedUsers,
  setUserActive,
  setUserRole,
  type ManagedUser,
} from "@/lib/admin-users.functions";
import { APP_ROLES, roleLabels, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users & roles — TrialBridge" },
      {
        name: "description",
        content: "Administrator console for managing workspace accounts, roles and account status.",
      },
      { property: "og:title", content: "Users & roles — TrialBridge" },
      {
        property: "og:description",
        content: "Manage workspace accounts, roles and account status.",
      },
    ],
  }),
  component: UsersPage,
});

type PendingChange = { user: ManagedUser; role: AppRole };

function UsersPage() {
  const queryClient = useQueryClient();
  const fetchUsers = useServerFn(listManagedUsers);
  const changeRole = useServerFn(setUserRole);
  const changeActive = useServerFn(setUserActive);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingChange | null>(null);

  const usersQuery = useQuery({
    queryKey: ["managed-users"],
    queryFn: () => fetchUsers(),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: AppRole }) => changeRole({ data: input }),
    onSuccess: () => {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed"),
  });

  const activeMutation = useMutation({
    mutationFn: (input: { userId: string; isActive: boolean }) => changeActive({ data: input }),
    onSuccess: () => {
      toast.success("Account status updated");
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed"),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = usersQuery.data ?? [];
    if (!term) return list;
    return list.filter((u) =>
      [u.fullName, u.email, u.organization, u.role]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [usersQuery.data, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Users & roles</h2>
          <p className="text-sm text-muted-foreground">
            Assign roles and control access. Role changes take effect on the user's next request.
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or role"
            aria-label="Search users"
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="size-4" /> Accounts
          </CardTitle>
          <CardDescription>
            Administrator privileges can only be granted here — never at registration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : usersQuery.isError ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {usersQuery.error instanceof Error
                ? usersQuery.error.message
                : "Could not load users."}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No accounts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.fullName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email ?? "—"}</TableCell>
                      <TableCell>
                        {user.role ? (
                          <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                            {user.role === "ADMIN" && <ShieldCheck className="mr-1 size-3" />}
                            {roleLabels[user.role]}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Pending selection</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={user.isActive}
                            aria-label="Account active"
                            onCheckedChange={(checked) =>
                              activeMutation.mutate({ userId: user.id, isActive: checked })
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {user.isActive ? "Active" : "Deactivated"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              Change role
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {APP_ROLES.filter((r) => r !== user.role).map((r) => (
                              <DropdownMenuItem
                                key={r}
                                onClick={() => setPending({ user, role: r })}
                              >
                                {r === "ADMIN" ? "Promote to " : "Set as "}
                                {roleLabels[r]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm role change</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && (
                <>
                  Change <strong>{pending.user.fullName ?? pending.user.email}</strong> to{" "}
                  <strong>{roleLabels[pending.role]}</strong>?
                  {pending.role === "ADMIN" &&
                    " This grants full administrative access, including user management."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) roleMutation.mutate({ userId: pending.user.id, role: pending.role });
                setPending(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
