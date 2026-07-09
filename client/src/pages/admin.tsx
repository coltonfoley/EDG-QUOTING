import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Edit, Package, Settings, Shield, Trash2, User as UserIcon } from "lucide-react";
import type { User } from "@shared/schema";
import { AppHeader } from "@/components/app-header";
import { StorageUsageCard } from "@/components/storage-usage-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const editUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.string().email().refine((email) => email.toLowerCase().endsWith("@edgpatioshade.com"), {
    message: "Use an EDG Google Workspace email address",
  }),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["user", "admin"]),
});

type EditUserData = z.infer<typeof editUserSchema>;

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: user?.role === "admin",
  });

  const editUserForm = useForm<EditUserData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { username: "", email: "", firstName: "", lastName: "", role: "user" },
  });

  const editUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: EditUserData }) => {
      const response = await apiRequest("PUT", `/api/admin/users/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Team member updated" });
      setEditingUser(null);
    },
    onError: (error: Error) => toast({ title: "Unable to update team member", description: error.message, variant: "destructive" }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => apiRequest("DELETE", `/api/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Team member removed" });
    },
    onError: (error: Error) => toast({ title: "Unable to remove team member", description: error.message, variant: "destructive" }),
  });

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card><CardContent className="text-center py-12"><Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" /><h2 className="text-2xl font-bold">Access Denied</h2></CardContent></Card>
        </div>
      </div>
    );
  }

  const openEditDialog = (teamMember: User) => {
    setEditingUser(teamMember);
    editUserForm.reset({
      username: teamMember.username,
      email: teamMember.email || "",
      firstName: teamMember.firstName || "",
      lastName: teamMember.lastName || "",
      role: teamMember.role as "user" | "admin",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Administration</h1>
          <p className="text-gray-600">Manage Google Workspace access and system settings</p>
          <div className="flex space-x-1 mt-6 border-b">
            <button className="px-4 py-2 text-sm font-medium text-edg-black border-b-2 border-edg-black bg-white">Users & Access</button>
            <Link href="/admin/contracts" className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-edg-black"><Settings className="inline mr-2 h-4 w-4" />Contracts</Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Workspace Team Members</CardTitle>
            <p className="text-sm text-gray-600">New users sign in with an approved EDG Google Workspace account. Password accounts are not supported.</p>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="text-center py-8">Loading users...</div> : (
              <Table>
                <TableHeader><TableRow><TableHead>Username</TableHead><TableHead>Name</TableHead><TableHead>Workspace Email</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {users.map((teamMember) => (
                    <TableRow key={teamMember.id}>
                      <TableCell className="font-medium">{teamMember.username}</TableCell>
                      <TableCell>{`${teamMember.firstName || ""} ${teamMember.lastName || ""}`.trim() || "—"}</TableCell>
                      <TableCell>{teamMember.email || "—"}</TableCell>
                      <TableCell><div className="flex items-center gap-1">{teamMember.role === "admin" ? <Shield className="h-4 w-4 text-blue-600" /> : <UserIcon className="h-4 w-4" />}{teamMember.role}</div></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(teamMember)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" disabled={user.id === teamMember.id} onClick={() => confirm("Remove this team member's Rainmaker access?") && deleteUserMutation.mutate(teamMember.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={Boolean(editingUser)} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Workspace Access</DialogTitle></DialogHeader>
            <Form {...editUserForm}>
              <form onSubmit={editUserForm.handleSubmit((data) => editingUser && editUserMutation.mutate({ id: editingUser.id, data }))} className="space-y-4">
                <FormField control={editUserForm.control} name="username" render={({ field }) => <FormItem><FormLabel>Username</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={editUserForm.control} name="email" render={({ field }) => <FormItem><FormLabel>Workspace Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={editUserForm.control} name="firstName" render={({ field }) => <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={editUserForm.control} name="lastName" render={({ field }) => <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                </div>
                <FormField control={editUserForm.control} name="role" render={({ field }) => <FormItem><FormLabel>Role</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="user">User</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button><Button type="submit" disabled={editUserMutation.isPending}>Save</Button></div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Card className="mt-8 border-edg-teal/30 bg-edg-teal/5"><CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Product tools moved to Products</CardTitle></CardHeader><CardContent><Button asChild><Link href="/products">Open Products</Link></Button></CardContent></Card>
        <StorageUsageCard />
      </div>
    </div>
  );
}
