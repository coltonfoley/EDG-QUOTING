import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
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
import { UserPlus, Shield, User as UserIcon, Trash2, Edit, FileSpreadsheet, Package, Settings, FileText, DollarSign, Users, Copy, Eye, EyeOff, Sparkles, AlertTriangle, CheckCircle2, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";
import type { User, Product } from "@shared/schema";
import { CSVProductImporter } from "@/components/csv-product-importer";
import { AIProductImporter } from "@/components/ai-product-importer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const createUserSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username is too long")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["user", "admin"]),
});

const editUserSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username is too long")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["user", "admin"]),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .optional().or(z.literal("")),
});

type CreateUserData = z.infer<typeof createUserSchema>;
type EditUserData = z.infer<typeof editUserSchema>;

const bulkUpdateSchema = z.object({
  manufacturer: z.string().optional(),
  retailPrice: z.string().optional(),
  defaultDiscountType: z.enum(["percentage", "dollar"]).optional(),
  defaultDiscountValue: z.string().optional(),
  unit: z.string().optional(),
});

type BulkUpdateData = z.infer<typeof bulkUpdateSchema>;

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
      setGeneratedPassword(null);
      setShowPassword(false);
      setCopied(false);
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

  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const generatePassword = () => {
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const all = lower + upper + digits;
    let password = '';
    password += upper[Math.floor(Math.random() * upper.length)];
    password += lower[Math.floor(Math.random() * lower.length)];
    password += digits[Math.floor(Math.random() * digits.length)];
    for (let i = 0; i < 9; i++) {
      password += all[Math.floor(Math.random() * all.length)];
    }
    password = password.split('').sort(() => Math.random() - 0.5).join('');
    createUserForm.setValue("password", password);
    setGeneratedPassword(password);
    setShowPassword(true);
    setCopied(false);
  };

  const copyPassword = async () => {
    if (generatedPassword) {
      try {
        await navigator.clipboard.writeText(generatedPassword);
        setCopied(true);
        toast({ title: "Password copied to clipboard" });
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast({ title: "Unable to copy", description: "Please select and copy the password manually", variant: "destructive" });
      }
    }
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
      role: userToEdit.role as "user" | "admin",
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Administration</h1>
          <p className="text-gray-600">Manage system settings and users</p>
          
          {/* Admin Navigation Tabs */}
          <div className="flex space-x-1 mt-6 border-b">
            <button 
              className="px-4 py-2 text-sm font-medium text-edg-black border-b-2 border-edg-black bg-white"
              data-testid="button-admin-users-active"
            >
              Users & Access
            </button>
            <Link 
              href="/admin/contracts"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-edg-black hover:border-b-2 hover:border-gray-300 transition-colors"
              data-testid="link-admin-contracts"
            >
              <Settings className="inline mr-2 h-4 w-4" />
              Contracts
            </Link>
            <Link 
              href="/admin/quickbooks"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-edg-black hover:border-b-2 hover:border-gray-300 transition-colors"
              data-testid="link-admin-quickbooks"
            >
              <DollarSign className="inline mr-2 h-4 w-4" />
              QuickBooks
            </Link>
            <Link 
              href="/admin/google-contacts"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-edg-black hover:border-b-2 hover:border-gray-300 transition-colors"
              data-testid="link-admin-google-contacts"
            >
              <Users className="inline mr-2 h-4 w-4" />
              Google Contacts
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Team Members</CardTitle>
            <Dialog open={showCreateDialog} onOpenChange={(open) => {
              setShowCreateDialog(open);
              if (!open) {
                setGeneratedPassword(null);
                setShowPassword(false);
                setCopied(false);
              }
            }}>
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
                            <div className="relative flex-1">
                              <FormControl>
                                <Input {...field} type={showPassword ? "text" : "password"} placeholder="Enter password" className="pr-10" />
                              </FormControl>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                              </Button>
                            </div>
                            <Button type="button" variant="outline" onClick={generatePassword}>
                              Generate
                            </Button>
                            {generatedPassword && (
                              <Button type="button" variant="outline" size="icon" onClick={copyPassword} title="Copy password">
                                <Copy className={`h-4 w-4 ${copied ? 'text-green-500' : ''}`} />
                              </Button>
                            )}
                          </div>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground">
                            Min 8 characters, with uppercase, lowercase, and a number
                          </p>
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
                  {users.map((rowUser) => (
                    <TableRow key={rowUser.id}>
                      <TableCell className="font-medium">{rowUser.username}</TableCell>
                      <TableCell>
                        {rowUser.firstName || rowUser.lastName 
                          ? `${rowUser.firstName || ''} ${rowUser.lastName || ''}`.trim()
                          : '—'
                        }
                      </TableCell>
                      <TableCell>{rowUser.email || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {rowUser.role === 'admin' ? (
                            <Shield className="h-4 w-4 text-blue-600" />
                          ) : (
                            <UserIcon className="h-4 w-4 text-gray-600" />
                          )}
                          <span className={rowUser.role === 'admin' ? 'text-blue-600 font-medium' : ''}>
                            {rowUser.role}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {rowUser.createdAt ? new Date(rowUser.createdAt).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(rowUser)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(rowUser.id)}
                            disabled={user.id === rowUser.id}
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
        {/* Product Import Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Product Import
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="ai" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="ai" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Import
                </TabsTrigger>
                <TabsTrigger value="manual" className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Manual CSV Import
                </TabsTrigger>
              </TabsList>
              <TabsContent value="ai">
                <AIProductImporter />
              </TabsContent>
              <TabsContent value="manual">
                <CSVProductImporter />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Product Management Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Product Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProductBulkEditor />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProductBulkEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [showBulkEditForm, setShowBulkEditForm] = useState(false);
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [discountFilter, setDiscountFilter] = useState<string>("all");

  const [productPage, setProductPage] = useState(0);
  const PRODUCTS_PER_PAGE = 50;

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", { limit: 10000 }],
    queryFn: async () => {
      const res = await fetch("/api/products?limit=10000", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });

  // Get unique manufacturers
  const manufacturers = useMemo(() => {
    if (!products) return [];
    const uniqueManufacturers = Array.from(new Set(
      products.map(p => p.manufacturer || "Unspecified")
    ));
    return uniqueManufacturers.sort();
  }, [products]);

  const getDiscountInfo = (product: Product) => {
    const retail = parseFloat(product.retailPrice?.toString() || "0");
    const discountVal = parseFloat(product.defaultDiscountValue?.toString() || "0") || 0;
    const discountType = product.defaultDiscountType || "percentage";
    const hasDiscount = discountVal > 0;

    let yourCost = retail;
    let discountLabel = "";
    if (hasDiscount) {
      if (discountType === "percentage") {
        yourCost = retail * (1 - discountVal / 100);
        discountLabel = `${discountVal}%`;
      } else {
        yourCost = Math.max(0, retail - discountVal);
        discountLabel = `$${discountVal.toFixed(2)}`;
      }
    }
    return { hasDiscount, yourCost, discountLabel, retail, discountVal, discountType };
  };

  const productStats = useMemo(() => {
    if (!products) return { total: 0, withDiscount: 0, withoutDiscount: 0 };
    const withDiscount = products.filter(p => parseFloat(p.defaultDiscountValue?.toString() || "0") > 0).length;
    return { total: products.length, withDiscount, withoutDiscount: products.length - withDiscount };
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    return products.filter(product => {
      const productManufacturer = product.manufacturer || "Unspecified";
      const matchesManufacturer = selectedManufacturer === "all" || 
        productManufacturer === selectedManufacturer;
      
      const matchesSearch = searchTerm === "" || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description || "").toLowerCase().includes(searchTerm.toLowerCase());

      const discountVal = parseFloat(product.defaultDiscountValue?.toString() || "0");
      const matchesDiscount = discountFilter === "all" ||
        (discountFilter === "with" && discountVal > 0) ||
        (discountFilter === "without" && discountVal === 0);
      
      return matchesManufacturer && matchesSearch && matchesDiscount;
    });
  }, [products, selectedManufacturer, searchTerm, discountFilter]);

  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    productPage * PRODUCTS_PER_PAGE,
    (productPage + 1) * PRODUCTS_PER_PAGE
  );

  useEffect(() => {
    setProductPage(0);
  }, [selectedManufacturer, searchTerm, discountFilter]);

  const bulkUpdateForm = useForm<BulkUpdateData>({
    resolver: zodResolver(bulkUpdateSchema),
    defaultValues: {
      manufacturer: "",
      retailPrice: "",
      defaultDiscountType: "percentage",
      defaultDiscountValue: "",
      unit: "",
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (data: BulkUpdateData) => {
      // Remove empty fields
      const updates = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value && value !== "")
      );
      
      const response = await apiRequest("POST", "/api/admin/bulk-update-products", {
        productIds: selectedProducts,
        updates,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Products updated successfully",
        description: `Updated ${data.updatedCount} products`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setSelectedProducts([]);
      setShowBulkEditForm(false);
      bulkUpdateForm.reset();
    },
    onError: (error: any) => {
      const errorMessage = error.errors 
        ? error.errors.map((e: any) => e.message).join(', ')
        : error.message || "Failed to update products";
      
      toast({
        title: "Update failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(filteredProducts.map(p => p.id));
    } else {
      setSelectedProducts([]);
    }
  };

  const handleSelectProduct = (productId: number, checked: boolean) => {
    if (checked) {
      setSelectedProducts([...selectedProducts, productId]);
    } else {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
    }
  };

  const handleBulkUpdate = (data: BulkUpdateData) => {
    bulkUpdateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-edg-teal"></div>
        <span className="ml-2 text-gray-600">Loading products...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Bulk Product Editor</h3>
          <p className="text-sm text-gray-600">
            {filteredProducts.length} products available for bulk editing
          </p>
        </div>
        
        {selectedProducts.length > 0 && (
          <Button
            onClick={() => setShowBulkEditForm(true)}
            className="bg-edg-teal hover:bg-edg-teal/90 text-white"
            data-testid="button-bulk-edit-products"
          >
            <Settings className="h-4 w-4 mr-2" />
            Edit {selectedProducts.length} Products
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          className={`p-3 rounded-lg border text-left transition-colors ${discountFilter === "all" ? "bg-gray-100 border-gray-400" : "bg-white border-gray-200 hover:bg-gray-50"}`}
          onClick={() => setDiscountFilter("all")}
        >
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">All Products</span>
          </div>
          <p className="text-2xl font-bold mt-1">{productStats.total}</p>
        </button>
        <button
          type="button"
          className={`p-3 rounded-lg border text-left transition-colors ${discountFilter === "with" ? "bg-emerald-50 border-emerald-400" : "bg-white border-gray-200 hover:bg-emerald-50/50"}`}
          onClick={() => setDiscountFilter("with")}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">Discount Set</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-emerald-700">{productStats.withDiscount}</p>
        </button>
        <button
          type="button"
          className={`p-3 rounded-lg border text-left transition-colors ${discountFilter === "without" ? "bg-amber-50 border-amber-400" : "bg-white border-gray-200 hover:bg-amber-50/50"}`}
          onClick={() => setDiscountFilter("without")}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">No Discount</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-amber-700">{productStats.withoutDiscount}</p>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <Label htmlFor="manufacturer-filter" data-testid="label-manufacturer-filter">Filter by Manufacturer</Label>
          <Select value={selectedManufacturer} onValueChange={setSelectedManufacturer}>
            <SelectTrigger id="manufacturer-filter" data-testid="select-manufacturer-filter">
              <SelectValue placeholder="Select manufacturer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="option-all-manufacturers">All Manufacturers</SelectItem>
              {manufacturers.map((manufacturer) => (
                <SelectItem key={manufacturer} value={manufacturer} data-testid={`option-manufacturer-${manufacturer.replace(/\s+/g, '-').toLowerCase()}`}>
                  {manufacturer}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="search-products" data-testid="label-search-products">Search Products</Label>
          <Input
            id="search-products"
            data-testid="input-search-products"
            type="text"
            placeholder="Search by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <p>No products found matching your criteria.</p>
          <p className="text-sm">Try adjusting your filters or importing products above.</p>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300"
                      data-testid="checkbox-select-all-products"
                      title={`Select all ${filteredProducts.length} filtered products`}
                    />
                  </TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead data-testid="header-manufacturer">Manufacturer</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Retail Price</TableHead>
                  <TableHead className="text-center">Discount</TableHead>
                  <TableHead className="text-right">Your Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProducts.map((product: Product) => {
                  const info = getDiscountInfo(product);
                  return (
                    <TableRow key={product.id} className={!info.hasDiscount ? "bg-amber-50/50" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product.id)}
                          onChange={(e) => handleSelectProduct(product.id, e.target.checked)}
                          className="rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell className="font-medium" data-testid={`text-product-name-${product.id}`}>{product.name}</TableCell>
                      <TableCell data-testid={`text-manufacturer-${product.id}`}>{product.manufacturer || "Unspecified"}</TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell className="text-right text-gray-500">
                        ${info.retail.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        {info.hasDiscount ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            {info.discountLabel} off
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
                            None
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {info.hasDiscount ? (
                          <span className="text-emerald-700">${info.yourCost.toFixed(2)}</span>
                        ) : (
                          <span className="text-amber-600">${info.retail.toFixed(2)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-gray-500">
                Showing {productPage * PRODUCTS_PER_PAGE + 1} - {Math.min((productPage + 1) * PRODUCTS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length}
                {selectedProducts.length > 0 && (
                  <span className="ml-2 font-medium text-teal-700">({selectedProducts.length} selected)</span>
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProductPage(p => Math.max(0, p - 1))}
                  disabled={productPage === 0}
                >
                  Previous
                </Button>
                <span className="text-sm self-center text-gray-600">
                  Page {productPage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProductPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={productPage >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk Edit Dialog */}
      <Dialog open={showBulkEditForm} onOpenChange={setShowBulkEditForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Edit Products</DialogTitle>
            <p className="text-sm text-gray-600">
              Update {selectedProducts.length} selected products. Leave fields blank to keep current values.
            </p>
          </DialogHeader>
          <Form {...bulkUpdateForm}>
            <form onSubmit={bulkUpdateForm.handleSubmit(handleBulkUpdate)} className="space-y-4">
              <FormField
                control={bulkUpdateForm.control}
                name="manufacturer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel data-testid="label-manufacturer-bulk">Manufacturer</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Leave blank to keep current" data-testid="input-manufacturer-bulk" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={bulkUpdateForm.control}
                name="retailPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retail Price (MSRP)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.01" placeholder="Leave blank to keep current" />
                    </FormControl>
                    <p className="text-xs text-gray-500">Optional manufacturer's suggested retail price</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={bulkUpdateForm.control}
                  name="defaultDiscountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Manufacturer Discount Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="dollar">Dollar Amount</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={bulkUpdateForm.control}
                  name="defaultDiscountValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Manufacturer Discount Value</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., 20" />
                      </FormControl>
                      <p className="text-xs text-gray-500">Discount off retail price</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={bulkUpdateForm.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., each, sq ft, linear ft" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowBulkEditForm(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={bulkUpdateMutation.isPending}
                  className="bg-edg-teal hover:bg-edg-teal/90 text-white"
                >
                  {bulkUpdateMutation.isPending ? "Updating..." : "Update Products"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}