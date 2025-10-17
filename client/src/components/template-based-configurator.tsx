import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { ConfiguratorTemplate, TemplateField, FieldRule, Product } from '@shared/schema';

interface TemplateBasedConfiguratorProps {
  manufacturer: string;
  quoteId: number;
  onInsert: () => void;
  onCancel: () => void;
}

type FieldValue = string | number | boolean | { [productId: number]: number };

interface FormValues {
  [fieldName: string]: FieldValue;
}

interface FieldState {
  visible: boolean;
  enabled: boolean;
  value?: any;
}

export function TemplateBasedConfigurator({
  manufacturer,
  quoteId,
  onInsert,
  onCancel,
}: TemplateBasedConfiguratorProps) {
  const { toast } = useToast();
  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>({});

  // Load template by manufacturer
  const { data: templates, isLoading: templatesLoading } = useQuery<ConfiguratorTemplate[]>({
    queryKey: ['/api/configurator-templates'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/configurator-templates');
      return response.json();
    },
  });

  const template = templates?.find(t => t.manufacturer === manufacturer && t.isActive);

  // Load products for product_list and category_products fields
  const { data: products } = useQuery<Product[]>({
    queryKey: ['/api/products', manufacturer],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/products?manufacturer=${manufacturer}`);
      return response.json();
    },
    enabled: !!template,
  });

  // Build dynamic schema based on template fields
  const formSchema = useMemo(() => {
    if (!template?.fields) return z.object({});

    const schemaFields: Record<string, any> = {};
    template.fields.forEach((field: TemplateField) => {
      let fieldSchema: any;

      switch (field.fieldType) {
        case 'text':
          fieldSchema = z.string();
          break;
        case 'number':
          fieldSchema = z.coerce.number();
          if (field.validationRules) {
            if (field.validationRules.min !== undefined) {
              fieldSchema = fieldSchema.min(field.validationRules.min);
            }
            if (field.validationRules.max !== undefined) {
              fieldSchema = fieldSchema.max(field.validationRules.max);
            }
          }
          break;
        case 'checkbox':
          fieldSchema = z.boolean();
          break;
        case 'select':
          fieldSchema = z.string();
          break;
        case 'product_list':
        case 'category_products':
          fieldSchema = z.record(z.coerce.number());
          break;
        default:
          fieldSchema = z.any();
      }

      if (!field.isRequired && field.fieldType !== 'checkbox') {
        fieldSchema = fieldSchema.optional();
      }

      schemaFields[field.fieldName] = fieldSchema;
    });

    return z.object(schemaFields);
  }, [template]);

  // Build default values (handle falsy defaults like 0, '', false)
  const defaultValues = useMemo(() => {
    if (!template?.fields) return {};

    const values: FormValues = {};
    template.fields.forEach((field: TemplateField) => {
      if (field.defaultValue !== null && field.defaultValue !== undefined) {
        values[field.fieldName] = field.defaultValue;
      } else if (field.fieldType === 'checkbox') {
        values[field.fieldName] = false;
      } else if (field.fieldType === 'product_list' || field.fieldType === 'category_products') {
        values[field.fieldName] = {};
      } else {
        values[field.fieldName] = '';
      }
    });
    return values;
  }, [template]);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  // Initialize field states
  useEffect(() => {
    if (template?.fields) {
      const initialStates: Record<string, FieldState> = {};
      template.fields.forEach((field: TemplateField) => {
        initialStates[field.fieldName] = {
          visible: true,
          enabled: true,
          value: defaultValues[field.fieldName],
        };
      });
      setFieldStates(initialStates);
    }
  }, [template, defaultValues]);

  // Apply rules whenever form values change
  const formValues = form.watch();
  useEffect(() => {
    if (!template?.rules || !template?.fields) return;

    // Start with default states (all fields visible and enabled)
    const newStates: Record<string, FieldState> = {};
    template.fields.forEach((field: TemplateField) => {
      newStates[field.fieldName] = {
        visible: true,
        enabled: true,
        value: formValues[field.fieldName],
      };
    });

    // Apply all rules based on current conditions
    template.rules.forEach((rule: FieldRule) => {
      const triggerValue = formValues[rule.triggerFieldName];
      const triggerMet = evaluateCondition(triggerValue, rule.triggerCondition, rule.triggerValue);

      if (triggerMet && newStates[rule.targetFieldName]) {
        switch (rule.actionType) {
          case 'show_field':
            newStates[rule.targetFieldName].visible = true;
            break;
          case 'hide_field':
            newStates[rule.targetFieldName].visible = false;
            break;
          case 'enable_field':
            newStates[rule.targetFieldName].enabled = true;
            break;
          case 'disable_field':
            newStates[rule.targetFieldName].enabled = false;
            break;
          case 'set_value':
            // Allow falsy action values (0, '', false)
            if (rule.actionValue !== null && rule.actionValue !== undefined && formValues[rule.targetFieldName] !== rule.actionValue) {
              form.setValue(rule.targetFieldName, rule.actionValue as any);
              newStates[rule.targetFieldName].value = rule.actionValue;
            }
            break;
        }
      } else if (!triggerMet && rule.actionType === 'set_value' && (rule.actionValue !== null && rule.actionValue !== undefined)) {
        // Reset value when condition is no longer met (including falsy defaults and action values)
        const field = template.fields.find(f => f.fieldName === rule.targetFieldName);
        const defaultVal = defaultValues[rule.targetFieldName];
        if (field && formValues[rule.targetFieldName] === rule.actionValue && defaultVal !== undefined) {
          form.setValue(rule.targetFieldName, defaultVal as any);
          newStates[rule.targetFieldName].value = defaultVal;
        }
      }
    });

    setFieldStates(newStates);
  }, [formValues, template?.rules, template?.fields]);

  const evaluateCondition = (fieldValue: any, condition: string, targetValue: string): boolean => {
    // Handle falsy values properly (don't coerce false/0 to empty string)
    const val = fieldValue !== null && fieldValue !== undefined ? String(fieldValue) : '';
    switch (condition) {
      case 'equals':
        return val === targetValue;
      case 'not_equals':
        return val !== targetValue;
      case 'greater_than':
        return parseFloat(val) > parseFloat(targetValue);
      case 'less_than':
        return parseFloat(val) < parseFloat(targetValue);
      case 'contains':
        return val.includes(targetValue);
      default:
        return false;
    }
  };

  const insertMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      // Build line items from configured data
      const items: any[] = [];

      // Extract product selections from product_list and category_products fields
      template?.fields.forEach((field: TemplateField) => {
        if ((field.fieldType === 'product_list' || field.fieldType === 'category_products') && data[field.fieldName]) {
          const quantities = data[field.fieldName] as { [productId: number]: number };
          Object.entries(quantities).forEach(([productId, quantity]) => {
            if (quantity > 0) {
              items.push({ productId: parseInt(productId), quantity });
            }
          });
        }
      });

      // Store complete configuration data for historical accuracy
      const configData = {
        manufacturer,
        templateId: template?.id,
        templateName: template?.name,
        fieldValues: data,
        timestamp: new Date().toISOString(),
      };

      const response = await apiRequest('POST', `/api/quotes/${quoteId}/configure-product`, {
        items,
        configData,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}/groups`] });
      toast({
        title: 'Configuration inserted',
        description: 'Products added to quote successfully',
      });
      onInsert();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (data: FormValues) => {
    insertMutation.mutate(data);
  };

  // Group fields by category
  const fieldsByCategory = useMemo(() => {
    if (!template?.fields) return {};

    const grouped: Record<string, TemplateField[]> = { 'General': [] };
    template.fields
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .forEach((field: TemplateField) => {
        const category = field.category || 'General';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push(field);
      });

    return grouped;
  }, [template]);

  const renderField = (field: TemplateField) => {
    const state = fieldStates[field.fieldName] || { visible: true, enabled: true };
    if (!state.visible) return null;

    switch (field.fieldType) {
      case 'text':
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.fieldName}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.fieldLabel}
                  {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    {...formField}
                    disabled={!state.enabled}
                    data-testid={`input-${field.fieldName}`}
                  />
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'number':
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.fieldName}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.fieldLabel}
                  {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...formField}
                    disabled={!state.enabled}
                    data-testid={`input-${field.fieldName}`}
                  />
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'select':
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.fieldName}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.fieldLabel}
                  {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                </FormLabel>
                <Select
                  onValueChange={formField.onChange}
                  value={formField.value as string}
                  disabled={!state.enabled}
                >
                  <FormControl>
                    <SelectTrigger data-testid={`select-${field.fieldName}`}>
                      <SelectValue placeholder="Select option..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Array.isArray(field.fieldOptions) && field.fieldOptions.map((opt: any) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'checkbox':
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.fieldName}
            render={({ field: formField }) => (
              <FormItem className="flex items-center space-x-2">
                <FormControl>
                  <Checkbox
                    checked={formField.value as boolean}
                    onCheckedChange={formField.onChange}
                    disabled={!state.enabled}
                    data-testid={`checkbox-${field.fieldName}`}
                  />
                </FormControl>
                <FormLabel className="!mt-0">
                  {field.fieldLabel}
                  {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                </FormLabel>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'product_list':
        return (
          <div key={field.id} className="space-y-3">
            <h4 className="font-semibold">{field.fieldLabel}</h4>
            {field.helpText && <p className="text-sm text-gray-500">{field.helpText}</p>}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {products?.map((product: Product) => (
                <ProductQuantityField
                  key={product.id}
                  product={product}
                  fieldName={field.fieldName}
                  form={form}
                  disabled={!state.enabled}
                />
              ))}
            </div>
          </div>
        );

      case 'category_products':
        const category = field.category || '';
        const categoryProducts = products?.filter((p: Product) => p.category === category) || [];
        return (
          <div key={field.id} className="space-y-3">
            <h4 className="font-semibold">{field.fieldLabel}</h4>
            {field.helpText && <p className="text-sm text-gray-500">{field.helpText}</p>}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {categoryProducts.map((product: Product) => (
                <ProductQuantityField
                  key={product.id}
                  product={product}
                  fieldName={field.fieldName}
                  form={form}
                  disabled={!state.enabled}
                />
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (templatesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!template) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-semibold mb-2">No Template Found</h3>
          <p className="text-gray-500 mb-4">
            No active configurator template found for {manufacturer}.
          </p>
          <p className="text-sm text-gray-400">
            Please create a template in the admin panel first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{template.name}</h2>
          {template.description && (
            <p className="text-gray-500">{template.description}</p>
          )}
        </div>
        <Badge variant="outline">{manufacturer}</Badge>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <ScrollArea className="h-[500px] pr-4">
            {Object.entries(fieldsByCategory).map(([category, fields]) => (
              <div key={category} className="mb-6">
                <h3 className="text-lg font-semibold mb-4">{category}</h3>
                <div className="space-y-4">
                  {fields.map(renderField)}
                </div>
                <Separator className="mt-6" />
              </div>
            ))}
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={insertMutation.isPending}
              data-testid="button-insert"
            >
              {insertMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Inserting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Insert into Quote
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function ProductQuantityField({
  product,
  fieldName,
  form,
  disabled,
}: {
  product: Product;
  fieldName: string;
  form: any;
  disabled: boolean;
}) {
  const quantities = form.watch(fieldName) || {};
  const quantity = quantities[product.id] || 0;

  const handleChange = (value: string) => {
    const numValue = parseInt(value) || 0;
    const currentQuantities = form.getValues(fieldName) || {};
    form.setValue(fieldName, {
      ...currentQuantities,
      [product.id]: numValue,
    });
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex-1">
        <p className="font-medium">{product.name}</p>
        <p className="text-sm text-gray-500">{formatCurrency(product.basePrice)}</p>
      </div>
      <Input
        type="number"
        min="0"
        value={quantity}
        onChange={(e) => handleChange(e.target.value)}
        className="w-24"
        disabled={disabled}
        data-testid={`input-product-qty-${product.id}`}
      />
    </div>
  );
}
