import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit, GripVertical, Type, Hash, CheckSquare, List, Package } from 'lucide-react';
import type { TemplateField } from '@shared/schema';

interface FieldBuilderProps {
  templateId: number;
}

const fieldFormSchema = z.object({
  fieldName: z.string().min(1, 'Field name is required'),
  fieldLabel: z.string().min(1, 'Field label is required'),
  fieldType: z.enum(['text', 'number', 'select', 'checkbox', 'product_list', 'category_products']),
  isRequired: z.boolean().default(false),
  defaultValue: z.string().optional(),
  validationRules: z.string().optional(),
  fieldOptions: z.string().optional(),
  displayOrder: z.coerce.number().int().min(0).default(0),
  category: z.string().optional(),
  helpText: z.string().optional(),
});

type FieldFormData = z.infer<typeof fieldFormSchema>;

const fieldTypeIcons = {
  text: Type,
  number: Hash,
  checkbox: CheckSquare,
  select: List,
  product_list: Package,
  category_products: Package,
};

export function FieldBuilder({ templateId }: FieldBuilderProps) {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingField, setEditingField] = useState<TemplateField | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const { data: template } = useQuery<any>({
    queryKey: ['/api/configurator-templates', templateId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/configurator-templates/${templateId}`);
      return response.json();
    },
  });

  const fields = template?.fields || [];

  const createForm = useForm<FieldFormData>({
    resolver: zodResolver(fieldFormSchema),
    defaultValues: {
      fieldName: '',
      fieldLabel: '',
      fieldType: 'text',
      isRequired: false,
      defaultValue: '',
      validationRules: '',
      fieldOptions: '',
      displayOrder: 0,
      category: '',
      helpText: '',
    },
  });

  const editForm = useForm<FieldFormData>({
    resolver: zodResolver(fieldFormSchema),
  });

  const createFieldMutation = useMutation({
    mutationFn: async (data: FieldFormData) => {
      let parsedOptions = null;
      if (data.fieldOptions) {
        try {
          parsedOptions = JSON.parse(data.fieldOptions);
        } catch {
          parsedOptions = data.fieldOptions.split(',').map(opt => ({ value: opt.trim(), label: opt.trim() }));
        }
      }

      let parsedRules = null;
      if (data.validationRules) {
        try {
          parsedRules = JSON.parse(data.validationRules);
        } catch {
          parsedRules = null;
        }
      }

      const response = await apiRequest('POST', `/api/configurator-templates/${templateId}/fields`, {
        ...data,
        fieldOptions: parsedOptions,
        validationRules: parsedRules,
        defaultValue: data.defaultValue || null,
        category: data.category || null,
        helpText: data.helpText || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/configurator-templates', templateId] });
      setIsCreateOpen(false);
      createForm.reset();
      toast({ title: 'Field added', description: 'Field added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ fieldId, data }: { fieldId: number; data: FieldFormData }) => {
      let parsedOptions = null;
      if (data.fieldOptions) {
        try {
          parsedOptions = JSON.parse(data.fieldOptions);
        } catch {
          parsedOptions = data.fieldOptions.split(',').map(opt => ({ value: opt.trim(), label: opt.trim() }));
        }
      }

      let parsedRules = null;
      if (data.validationRules) {
        try {
          parsedRules = JSON.parse(data.validationRules);
        } catch {
          parsedRules = null;
        }
      }

      const response = await apiRequest('PATCH', `/api/configurator-templates/${templateId}/fields/${fieldId}`, {
        ...data,
        fieldOptions: parsedOptions,
        validationRules: parsedRules,
        defaultValue: data.defaultValue || null,
        category: data.category || null,
        helpText: data.helpText || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/configurator-templates', templateId] });
      setIsEditOpen(false);
      setEditingField(null);
      toast({ title: 'Field updated', description: 'Field updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (fieldId: number) => {
      await apiRequest('DELETE', `/api/configurator-templates/${templateId}/fields/${fieldId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/configurator-templates', templateId] });
      toast({ title: 'Field deleted', description: 'Field deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openEdit = (field: TemplateField) => {
    setEditingField(field);
    editForm.reset({
      fieldName: field.fieldName,
      fieldLabel: field.fieldLabel,
      fieldType: field.fieldType as any,
      isRequired: field.isRequired,
      defaultValue: field.defaultValue || '',
      validationRules: field.validationRules ? JSON.stringify(field.validationRules) : '',
      fieldOptions: field.fieldOptions ? JSON.stringify(field.fieldOptions) : '',
      displayOrder: field.displayOrder,
      category: field.category || '',
      helpText: field.helpText || '',
    });
    setIsEditOpen(true);
  };

  const FieldForm = ({ form, onSubmit, isPending }: { form: any; onSubmit: (data: FieldFormData) => void; isPending: boolean }) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="fieldName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Field Name (ID)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., width" {...field} data-testid="input-field-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fieldLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Field Label</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Width (inches)" {...field} data-testid="input-field-label" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="fieldType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Field Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-field-type">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="select">Select (Dropdown)</SelectItem>
                    <SelectItem value="checkbox">Checkbox</SelectItem>
                    <SelectItem value="product_list">Product List</SelectItem>
                    <SelectItem value="category_products">Category Products</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="displayOrder"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display Order</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0" {...field} data-testid="input-display-order" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Dimensions, Options" {...field} data-testid="input-category" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="defaultValue"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default Value (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="Default value" {...field} data-testid="input-default-value" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fieldOptions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Options (for select fields)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='Option1, Option2, Option3 or [{"value":"opt1","label":"Option 1"}]'
                  {...field}
                  data-testid="input-field-options"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="validationRules"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Validation Rules (JSON)</FormLabel>
              <FormControl>
                <Textarea placeholder='{"min": 1, "max": 100}' {...field} data-testid="input-validation-rules" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="helpText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Help Text (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="Helper text for users" {...field} data-testid="input-help-text" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isRequired"
          render={({ field }) => (
            <FormItem className="flex items-center space-x-2">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">Required Field</FormLabel>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => editingField ? setIsEditOpen(false) : setIsCreateOpen(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} data-testid="button-submit">
            {isPending ? 'Saving...' : editingField ? 'Update Field' : 'Add Field'}
          </Button>
        </div>
      </form>
    </Form>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Template Fields</h3>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-field">
              <Plus className="w-4 h-4 mr-2" />
              Add Field
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Field</DialogTitle>
              <DialogDescription>
                Create a new field for this configurator template
              </DialogDescription>
            </DialogHeader>
            <FieldForm form={createForm} onSubmit={(data) => createFieldMutation.mutate(data)} isPending={createFieldMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {fields.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-gray-500">No fields yet. Add your first field to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {fields.map((field: TemplateField) => {
            const Icon = fieldTypeIcons[field.fieldType as keyof typeof fieldTypeIcons] || Type;
            return (
              <Card key={field.id} data-testid={`field-card-${field.id}`}>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <GripVertical className="w-4 h-4 text-gray-400" />
                      <Icon className="w-4 h-4 text-gray-600" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{field.fieldLabel}</span>
                          {field.isRequired && <Badge variant="secondary" className="text-xs">Required</Badge>}
                        </div>
                        <p className="text-xs text-gray-500">
                          {field.fieldName} • {field.fieldType}
                          {field.category && ` • ${field.category}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(field)}
                        data-testid={`button-edit-field-${field.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete field "${field.fieldLabel}"?`)) {
                            deleteFieldMutation.mutate(field.id);
                          }
                        }}
                        disabled={deleteFieldMutation.isPending}
                        data-testid={`button-delete-field-${field.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Field</DialogTitle>
            <DialogDescription>
              Update field configuration
            </DialogDescription>
          </DialogHeader>
          {editingField && (
            <FieldForm 
              form={editForm} 
              onSubmit={(data) => updateFieldMutation.mutate({ fieldId: editingField.id, data })} 
              isPending={updateFieldMutation.isPending} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
