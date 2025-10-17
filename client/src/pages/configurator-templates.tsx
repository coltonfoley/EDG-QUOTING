import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit, Trash2, Settings, Code, Eye } from 'lucide-react';
import type { ConfiguratorTemplate } from '@shared/schema';
import { FieldBuilder } from '@/components/field-builder';
import { RuleBuilder } from '@/components/rule-builder';

export default function ConfiguratorTemplatesPage() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<ConfiguratorTemplate | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const { data: templates, isLoading } = useQuery<ConfiguratorTemplate[]>({
    queryKey: ['/api/configurator-templates'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/configurator-templates', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/configurator-templates'] });
      setIsCreateOpen(false);
      toast({
        title: 'Template created',
        description: 'Configurator template created successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (templateId: number) => {
      await apiRequest('DELETE', `/api/configurator-templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/configurator-templates'] });
      toast({
        title: 'Template deleted',
        description: 'Configurator template deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      manufacturer: formData.get('manufacturer'),
      name: formData.get('name'),
      description: formData.get('description'),
      layoutType: formData.get('layoutType'),
      isActive: formData.get('isActive') === 'on',
    });
  };

  const handleDelete = (template: ConfiguratorTemplate) => {
    if (confirm(`Are you sure you want to delete the ${template.name} template?`)) {
      deleteMutation.mutate(template.id);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="border-b bg-white dark:bg-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Configurator Templates
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Manage product configurator templates for different manufacturers
              </p>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-template">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Configurator Template</DialogTitle>
                  <DialogDescription>
                    Create a new template for configuring products from a manufacturer
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="manufacturer">Manufacturer</Label>
                    <Input
                      id="manufacturer"
                      name="manufacturer"
                      placeholder="e.g., Progressive"
                      required
                      data-testid="input-manufacturer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Template Name</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="e.g., Progressive Configurator"
                      required
                      data-testid="input-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder="Describe what this configurator does"
                      data-testid="input-description"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="layoutType">Layout Type</Label>
                    <Select name="layoutType" defaultValue="catalog">
                      <SelectTrigger data-testid="select-layout-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="catalog">Catalog (Product List)</SelectItem>
                        <SelectItem value="wizard">Wizard (Step-by-Step)</SelectItem>
                        <SelectItem value="form">Form (Single Page)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="isActive" name="isActive" defaultChecked />
                    <Label htmlFor="isActive">Active</Label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateOpen(false)}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending}
                      data-testid="button-submit"
                    >
                      {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Create Template
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : templates && templates.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id} data-testid={`template-card-${template.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl">{template.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {template.manufacturer}
                      </CardDescription>
                    </div>
                    <Badge variant={template.isActive ? 'default' : 'secondary'}>
                      {template.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {template.description || 'No description'}
                  </p>
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="outline">{template.layoutType}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setIsEditOpen(true);
                      }}
                      data-testid={`button-edit-${template.id}`}
                    >
                      <Settings className="w-4 h-4 mr-1" />
                      Configure
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(template)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${template.id}`}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Code className="w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Templates Yet</h3>
              <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
                Create your first configurator template to get started
              </p>
              <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first">
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Template Editor Dialog - Will be enhanced in next task */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              Configure: {selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              Manage fields and rules for this configurator template
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="fields" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="fields">Fields</TabsTrigger>
              <TabsTrigger value="rules">Rules</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="fields" className="space-y-4 py-4">
              {selectedTemplate && <FieldBuilder templateId={selectedTemplate.id} />}
            </TabsContent>
            <TabsContent value="rules" className="space-y-4 py-4">
              {selectedTemplate && <RuleBuilder templateId={selectedTemplate.id} />}
            </TabsContent>
            <TabsContent value="preview" className="space-y-4">
              <div className="text-center py-8 text-gray-500">
                <Eye className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>Preview mode coming soon...</p>
                <p className="text-sm mt-2">You'll be able to test your configurator here before going live.</p>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
