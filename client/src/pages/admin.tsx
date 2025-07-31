import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { UserPlus, Shield, User as UserIcon, Trash2, Edit, Upload, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { z } from "zod";
import type { User } from "@shared/schema";

const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["user", "admin"]),
});

const editUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["user", "admin"]),
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
});

type CreateUserData = z.infer<typeof createUserSchema>;
type EditUserData = z.infer<typeof editUserSchema>;

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Check if user is admin
  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="text-center py-12">
              <Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
              <p className="text-gray-600">You need administrator privileges to access this page.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const createUserForm = useForm<CreateUserData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      password: "",
      email: "",
      firstName: "",
      lastName: "",
      role: "user",
    },
  });

  const editUserForm = useForm<EditUserData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      username: "",
      email: "",
      firstName: "",
      lastName: "",
      role: "user",
      password: "",
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserData) => {
      const response = await apiRequest("POST", "/api/admin/users", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created successfully" });
      setShowCreateDialog(false);
      createUserForm.reset();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const editUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: EditUserData }) => {
      // Filter out empty password
      const updateData = { ...data };
      if (!updateData.password || updateData.password === "") {
        delete updateData.password;
      }
      const response = await apiRequest("PUT", `/api/admin/users/${id}`, updateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated successfully" });
      setShowEditDialog(false);
      setEditingUser(null);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const generatePassword = () => {
    const password = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    createUserForm.setValue("password", password);
  };

  const handleCreateUser = (data: CreateUserData) => {
    createUserMutation.mutate(data);
  };

  const handleEditUser = (data: EditUserData) => {
    if (editingUser) {
      editUserMutation.mutate({ id: editingUser.id, data });
    }
  };

  const openEditDialog = (userToEdit: User) => {
    setEditingUser(userToEdit);
    editUserForm.reset({
      username: userToEdit.username,
      email: userToEdit.email || "",
      firstName: userToEdit.firstName || "",
      lastName: userToEdit.lastName || "",
      role: userToEdit.role,
      password: "",
    });
    setShowEditDialog(true);
  };

  const handleDeleteUser = (userId: number) => {
    if (userId === user.id) {
      toast({ 
        title: "Error", 
        description: "You cannot delete your own account", 
        variant: "destructive" 
      });
      return;
    }
    
    if (confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      deleteUserMutation.mutate(userId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">User Management</h1>
          <p className="text-gray-600">Create and manage team member accounts</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Team Members</CardTitle>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="bg-edg-black hover:bg-edg-grey text-white">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Team Member
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New User Account</DialogTitle>
                </DialogHeader>
                <Form {...createUserForm}>
                  <form onSubmit={createUserForm.handleSubmit(handleCreateUser)} className="space-y-4">
                    <FormField
                      control={createUserForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter username" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createUserForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input {...field} type="password" placeholder="Enter password" />
                            </FormControl>
                            <Button type="button" variant="outline" onClick={generatePassword}>
                              Generate
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={createUserForm.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Optional" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={createUserForm.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Optional" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={createUserForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" placeholder="Optional" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createUserForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2 pt-4">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setShowCreateDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createUserMutation.isPending}
                        className="bg-edg-black hover:bg-edg-grey text-white"
                      >
                        {createUserMutation.isPending ? "Creating..." : "Create User"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading users...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>
                        {user.firstName || user.lastName 
                          ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                          : '—'
                        }
                      </TableCell>
                      <TableCell>{user.email || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {user.role === 'admin' ? (
                            <Shield className="h-4 w-4 text-blue-600" />
                          ) : (
                            <UserIcon className="h-4 w-4 text-gray-600" />
                          )}
                          <span className={user.role === 'admin' ? 'text-blue-600 font-medium' : ''}>
                            {user.role}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(user)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={user.id === user.id}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit User Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit User Account</DialogTitle>
            </DialogHeader>
            <Form {...editUserForm}>
              <form onSubmit={editUserForm.handleSubmit(handleEditUser)} className="space-y-4">
                <FormField
                  control={editUserForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter username" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editUserForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Optional" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editUserForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Optional" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={editUserForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="Optional" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editUserForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editUserForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" placeholder="Leave blank to keep current password" />
                      </FormControl>
                      <FormMessage />
                      <p className="text-sm text-gray-500">
                        Only enter a password if you want to change it
                      </p>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowEditDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={editUserMutation.isPending}
                    className="bg-edg-black hover:bg-edg-grey text-white"
                  >
                    {editUserMutation.isPending ? "Updating..." : "Update User"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        {/* Price List Uploader Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Price List Uploader
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PriceListUploader />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PriceListUploader() {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    const allowedTypes = ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, Excel file, or image (JPG/PNG)",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    setResults(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/admin/upload-price-list', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const data = await response.json();
      setResults({
        created: data.created,
        updated: data.updated,
        skipped: data.skipped,
        errors: data.errors || [],
      });

      toast({
        title: "Price list processed successfully",
        description: `Created: ${data.created}, Updated: ${data.updated}, Skipped: ${data.skipped}`,
      });

      // Clear the input
      event.target.value = '';
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to process price list",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 mb-4">
        Upload a manufacturer price list (PDF, Excel, or image) to automatically extract and import products into your catalog.
      </div>
      
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <label htmlFor="price-list-upload" className="cursor-pointer">
          <span className="text-edg-teal hover:text-edg-teal/80 font-medium">
            Click to upload
          </span>
          <span className="text-gray-600"> or drag and drop</span>
        </label>
        <p className="text-xs text-gray-500 mt-2">PDF, Excel (.xls, .xlsx), or images (JPG, PNG) up to 10MB</p>
        <input
          id="price-list-upload"
          type="file"
          onChange={handleFileUpload}
          accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png"
          className="hidden"
          disabled={uploading}
        />
      </div>

      {uploading && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-edg-teal"></div>
          <span className="ml-2 text-gray-600">Processing price list...</span>
        </div>
      )}

      {results && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Import Results
          </h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{results.created}</div>
              <div className="text-gray-600">Products Created</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{results.updated}</div>
              <div className="text-gray-600">Products Updated</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{results.skipped}</div>
              <div className="text-gray-600">Products Skipped</div>
            </div>
          </div>
          
          {results.errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 rounded border border-red-200">
              <h5 className="font-medium text-red-800 mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Processing Errors
              </h5>
              <ul className="text-sm text-red-700 space-y-1">
                {results.errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}