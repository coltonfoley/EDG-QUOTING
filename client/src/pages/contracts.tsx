import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, FileText, Shield, User as UserIcon, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AppHeader } from "@/components/app-header";
import type { ContractTemplate, InsertContractTemplate } from "@shared/schema";

export default function ContractsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);

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

  const { data: templates = [], isLoading } = useQuery<ContractTemplate[]>({
    queryKey: ["/api/contract-templates"],
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: InsertContractTemplate) => {
      const response = await apiRequest("POST", "/api/contract-templates", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Contract template created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      setShowCreateDialog(false);
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to create contract template", 
        variant: "destructive" 
      });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertContractTemplate> }) => {
      const response = await apiRequest("PUT", `/api/contract-templates/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Contract template updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/contract-templates"] });
      setEditingTemplate(null);
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to update contract template", 
        variant: "destructive" 
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/contract-templates/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Contract template deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/contract-templates"] });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to delete contract template", 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      name: formData.get("name") as string,
      title: formData.get("title") as string,
      terms: formData.get("terms") as string,
      isDefault: formData.get("isDefault") === "on",
    };

    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this contract template?")) {
      deleteTemplateMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-lg">Loading contract templates...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Administration</h1>
          <p className="text-gray-600">Manage system settings, users, and templates</p>
          
          {/* Admin Navigation Tabs */}
          <div className="flex space-x-1 mt-6 border-b">
            <Link 
              href="/admin"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-edg-black hover:border-b-2 hover:border-gray-300 transition-colors"
              data-testid="link-admin-users"
            >
              <UserIcon className="inline mr-2 h-4 w-4" />
              Users & Access
            </Link>
            <Link 
              href="/admin/templates"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-edg-black hover:border-b-2 hover:border-gray-300 transition-colors"
              data-testid="link-admin-templates"
            >
              <FileText className="inline mr-2 h-4 w-4" />
              Templates
            </Link>
            <button 
              className="px-4 py-2 text-sm font-medium text-edg-black border-b-2 border-edg-black bg-white"
              data-testid="button-admin-contracts-active"
            >
              <Settings className="inline mr-2 h-4 w-4" />
              Contracts
            </button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Contract Templates</CardTitle>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="bg-edg-black hover:bg-edg-grey text-white">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Template
                </Button>
              </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Create Contract Template</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Template Name</Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    placeholder="e.g., Standard Service Agreement"
                  />
                </div>
                <div>
                  <Label htmlFor="title">Contract Title</Label>
                  <Input
                    id="title"
                    name="title"
                    required
                    placeholder="e.g., Service Agreement"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="terms">Contract Terms</Label>
                <Textarea
                  id="terms"
                  name="terms"
                  required
                  rows={15}
                  placeholder="Enter the complete contract terms and conditions..."
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  name="isDefault"
                  className="rounded"
                />
                <Label htmlFor="isDefault">Set as default template</Label>
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createTemplateMutation.isPending}
                  className="bg-edg-black hover:bg-edg-grey text-white"
                >
                  Create Template
                </Button>
              </div>
            </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template) => (
          <Card key={template.id} className="h-fit">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">{template.title}</p>
                </div>
                <div className="flex space-x-1">
                  {template.isDefault && (
                    <Badge variant="secondary" className="text-xs">
                      Default
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-gray-700 max-h-32 overflow-y-auto">
                  {template.terms.substring(0, 200)}...
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>Created: {new Date(template.createdAt!).toLocaleDateString()}</span>
                </div>
                <div className="flex space-x-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1">
                        <FileText className="mr-2 h-4 w-4" />
                        View
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl">
                      <DialogHeader>
                        <DialogTitle>{template.name}</DialogTitle>
                      </DialogHeader>
                      <div className="max-h-96 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm">{template.terms}</pre>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={editingTemplate?.id === template.id} onOpenChange={(open) => !open && setEditingTemplate(null)}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingTemplate(template)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl">
                      <DialogHeader>
                        <DialogTitle>Edit Contract Template</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="name">Template Name</Label>
                            <Input
                              id="name"
                              name="name"
                              required
                              defaultValue={template.name}
                            />
                          </div>
                          <div>
                            <Label htmlFor="title">Contract Title</Label>
                            <Input
                              id="title"
                              name="title"
                              required
                              defaultValue={template.title}
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="terms">Contract Terms</Label>
                          <Textarea
                            id="terms"
                            name="terms"
                            required
                            rows={15}
                            defaultValue={template.terms}
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="isDefault"
                            name="isDefault"
                            className="rounded"
                            defaultChecked={template.isDefault ?? false}
                          />
                          <Label htmlFor="isDefault">Set as default template</Label>
                        </div>
                        <div className="flex justify-end space-x-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEditingTemplate(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={updateTemplateMutation.isPending}
                            className="bg-edg-black hover:bg-edg-grey text-white"
                          >
                            Update Template
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(template.id)}
                    disabled={deleteTemplateMutation.isPending}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
            {templates.length === 0 && (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No contract templates</h3>
                <p className="text-gray-600 mb-4">
                  Create your first contract template to use with quotes
                </p>
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  className="bg-edg-black hover:bg-edg-grey text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Template
                </Button>
              </div>
            )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}