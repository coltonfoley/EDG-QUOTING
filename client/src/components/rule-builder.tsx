import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit, ArrowRight } from 'lucide-react';
import type { FieldRule } from '@shared/schema';

interface RuleBuilderProps {
  templateId: number;
}

const ruleFormSchema = z.object({
  triggerFieldName: z.string().min(1, 'Trigger field is required'),
  triggerCondition: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains']),
  triggerValue: z.string().min(1, 'Trigger value is required'),
  actionType: z.enum(['show_field', 'hide_field', 'enable_field', 'disable_field', 'set_value']),
  targetFieldName: z.string().min(1, 'Target field is required'),
  actionValue: z.string().optional(),
});

type RuleFormData = z.infer<typeof ruleFormSchema>;

export function RuleBuilder({ templateId }: RuleBuilderProps) {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FieldRule | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const { data: template } = useQuery<any>({
    queryKey: ['/api/configurator-templates', templateId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/configurator-templates/${templateId}`);
      return response.json();
    },
  });

  const rules = template?.rules || [];
  const fields = template?.fields || [];

  const createForm = useForm<RuleFormData>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: {
      triggerFieldName: '',
      triggerCondition: 'equals',
      triggerValue: '',
      actionType: 'show_field',
      targetFieldName: '',
      actionValue: '',
    },
  });

  const editForm = useForm<RuleFormData>({
    resolver: zodResolver(ruleFormSchema),
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data: RuleFormData) => {
      const response = await apiRequest('POST', `/api/configurator-templates/${templateId}/rules`, {
        ...data,
        actionValue: data.actionValue || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/configurator-templates', templateId] });
      setIsCreateOpen(false);
      createForm.reset();
      toast({ title: 'Rule added', description: 'Rule added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ ruleId, data }: { ruleId: number; data: RuleFormData }) => {
      const response = await apiRequest('PATCH', `/api/configurator-templates/${templateId}/rules/${ruleId}`, {
        ...data,
        actionValue: data.actionValue || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/configurator-templates', templateId] });
      setIsEditOpen(false);
      setEditingRule(null);
      toast({ title: 'Rule updated', description: 'Rule updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      await apiRequest('DELETE', `/api/configurator-templates/${templateId}/rules/${ruleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/configurator-templates', templateId] });
      toast({ title: 'Rule deleted', description: 'Rule deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openEdit = (rule: FieldRule) => {
    setEditingRule(rule);
    editForm.reset({
      triggerFieldName: rule.triggerFieldName,
      triggerCondition: rule.triggerCondition as any,
      triggerValue: rule.triggerValue,
      actionType: rule.actionType as any,
      targetFieldName: rule.targetFieldName,
      actionValue: rule.actionValue || '',
    });
    setIsEditOpen(true);
  };

  const getConditionLabel = (condition: string) => {
    const labels: Record<string, string> = {
      equals: '=',
      not_equals: '≠',
      greater_than: '>',
      less_than: '<',
      contains: 'contains',
    };
    return labels[condition] || condition;
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      show_field: 'Show',
      hide_field: 'Hide',
      enable_field: 'Enable',
      disable_field: 'Disable',
      set_value: 'Set value of',
    };
    return labels[action] || action;
  };

  const RuleForm = ({ form, onSubmit, isPending }: { form: any; onSubmit: (data: RuleFormData) => void; isPending: boolean }) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-4">
          <h4 className="font-semibold">When (Trigger Condition)</h4>
          
          <div className="grid grid-cols-3 gap-3">
            <FormField
              control={form.control}
              name="triggerFieldName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Field</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-trigger-field">
                        <SelectValue placeholder="Select field..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fields.map((f: any) => (
                        <SelectItem key={f.id} value={f.fieldName}>
                          {f.fieldLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="triggerCondition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condition</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-trigger-condition">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="equals">Equals (=)</SelectItem>
                      <SelectItem value="not_equals">Not Equals (≠)</SelectItem>
                      <SelectItem value="greater_than">Greater Than (&gt;)</SelectItem>
                      <SelectItem value="less_than">Less Than (&lt;)</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="triggerValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value</FormLabel>
                  <FormControl>
                    <Input placeholder="Value to check" {...field} data-testid="input-trigger-value" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg space-y-4">
          <h4 className="font-semibold">Then (Action)</h4>
          
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="actionType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Action</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-action-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="show_field">Show Field</SelectItem>
                      <SelectItem value="hide_field">Hide Field</SelectItem>
                      <SelectItem value="enable_field">Enable Field</SelectItem>
                      <SelectItem value="disable_field">Disable Field</SelectItem>
                      <SelectItem value="set_value">Set Value</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetFieldName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target Field</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-target-field">
                        <SelectValue placeholder="Select field..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fields.map((f: any) => (
                        <SelectItem key={f.id} value={f.fieldName}>
                          {f.fieldLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="actionValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Action Value (for "Set Value" action)</FormLabel>
                <FormControl>
                  <Input placeholder="Optional value to set" {...field} data-testid="input-action-value" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => editingRule ? setIsEditOpen(false) : setIsCreateOpen(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} data-testid="button-submit">
            {isPending ? 'Saving...' : editingRule ? 'Update Rule' : 'Add Rule'}
          </Button>
        </div>
      </form>
    </Form>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Conditional Rules</h3>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-rule">
              <Plus className="w-4 h-4 mr-2" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Add Conditional Rule</DialogTitle>
              <DialogDescription>
                Create an if/then rule to show, hide, enable, or disable fields based on conditions
              </DialogDescription>
            </DialogHeader>
            <RuleForm form={createForm} onSubmit={(data) => createRuleMutation.mutate(data)} isPending={createRuleMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-gray-500">No rules yet. Add conditional logic to make your configurator dynamic.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule: FieldRule) => (
            <Card key={rule.id} data-testid={`rule-card-${rule.id}`}>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">IF</span>
                      <Badge variant="outline">{rule.triggerFieldName}</Badge>
                      <span>{getConditionLabel(rule.triggerCondition)}</span>
                      <Badge>{rule.triggerValue}</Badge>
                      <ArrowRight className="w-4 h-4 mx-1 text-gray-400" />
                      <span className="font-medium">THEN</span>
                      <Badge variant="secondary">{getActionLabel(rule.actionType)}</Badge>
                      <Badge variant="outline">{rule.targetFieldName}</Badge>
                      {rule.actionValue && (
                        <>
                          <span>to</span>
                          <Badge>{rule.actionValue}</Badge>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(rule)}
                      data-testid={`button-edit-rule-${rule.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm('Delete this rule?')) {
                          deleteRuleMutation.mutate(rule.id);
                        }
                      }}
                      disabled={deleteRuleMutation.isPending}
                      data-testid={`button-delete-rule-${rule.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Conditional Rule</DialogTitle>
            <DialogDescription>
              Update the if/then rule configuration
            </DialogDescription>
          </DialogHeader>
          {editingRule && (
            <RuleForm 
              form={editForm} 
              onSubmit={(data) => updateRuleMutation.mutate({ ruleId: editingRule.id, data })} 
              isPending={updateRuleMutation.isPending} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
