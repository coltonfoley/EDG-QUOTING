import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Save, 
  X, 
  Calendar, 
  Clock, 
  DollarSign, 
  User, 
  Target, 
  AlertTriangle,
  CheckCircle2,
  FileText,
  Settings,
  Layers,
  Users
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertProjectTaskSchema } from "@shared/schema";
import type { 
  ProjectTask,
  InsertProjectTask,
  User,
  ProjectCrew,
  ProjectMilestone,
  ProjectTaskWithDetails
} from "@shared/schema";
import { z } from "zod";

interface TaskFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  parentTaskId?: number;
  editTask?: ProjectTask;
  onSuccess?: (task: ProjectTask) => void;
}

interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  estimatedHours: number;
  priority: string;
  taskType: string;
  subtasks?: {
    title: string;
    description: string;
    estimatedHours: number;
    displayOrder: number;
  }[];
}

const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'installation',
    name: 'Standard Installation',
    description: 'Complete installation workflow',
    estimatedHours: 16,
    priority: 'medium',
    taskType: 'installation',
    subtasks: [
      { title: 'Site preparation', description: 'Prepare installation site', estimatedHours: 2, displayOrder: 1 },
      { title: 'Equipment setup', description: 'Setup required equipment', estimatedHours: 4, displayOrder: 2 },
      { title: 'Installation', description: 'Perform main installation', estimatedHours: 8, displayOrder: 3 },
      { title: 'Testing & QC', description: 'Test installation and quality check', estimatedHours: 2, displayOrder: 4 }
    ]
  },
  {
    id: 'inspection',
    name: 'Site Inspection',
    description: 'Comprehensive site inspection',
    estimatedHours: 4,
    priority: 'high',
    taskType: 'inspection',
    subtasks: [
      { title: 'Initial assessment', description: 'Initial site assessment', estimatedHours: 1, displayOrder: 1 },
      { title: 'Detailed inspection', description: 'Detailed inspection of all areas', estimatedHours: 2, displayOrder: 2 },
      { title: 'Report generation', description: 'Generate inspection report', estimatedHours: 1, displayOrder: 3 }
    ]
  },
  {
    id: 'delivery',
    name: 'Material Delivery',
    description: 'Material delivery and verification',
    estimatedHours: 2,
    priority: 'medium',
    taskType: 'delivery',
    subtasks: [
      { title: 'Delivery preparation', description: 'Prepare materials for delivery', estimatedHours: 0.5, displayOrder: 1 },
      { title: 'Transportation', description: 'Transport materials to site', estimatedHours: 1, displayOrder: 2 },
      { title: 'Verification', description: 'Verify delivery and condition', estimatedHours: 0.5, displayOrder: 3 }
    ]
  }
];

const TASK_TYPES = [
  'installation',
  'inspection', 
  'delivery',
  'cleanup',
  'maintenance',
  'planning',
  'documentation',
  'client_meeting',
  'other'
];

// Extended form schema with additional validation
const taskFormSchema = insertProjectTaskSchema.extend({
  customFields: z.record(z.any()).optional(),
  createSubtasks: z.boolean().default(false),
  templateId: z.string().optional(),
  estimatedCostCalculated: z.number().optional()
});

type TaskFormData = z.infer<typeof taskFormSchema>;

export const TaskFormModal = ({ 
  isOpen, 
  onOpenChange, 
  projectId, 
  parentTaskId, 
  editTask,
  onSuccess 
}: TaskFormProps) => {
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [customFields, setCustomFields] = useState<Record<string, any>>({});
  const { toast } = useToast();

  // Fetch related data
  const { data: tasks = [] } = useQuery<ProjectTaskWithDetails[]>({
    queryKey: ['/api/projects', projectId, 'tasks'],
    enabled: !!projectId && isOpen,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users'],
    enabled: isOpen,
  });

  const { data: crew = [] } = useQuery<ProjectCrew[]>({
    queryKey: ['/api/projects', projectId, 'crew'],
    enabled: !!projectId && isOpen,
  });

  const { data: milestones = [] } = useQuery<ProjectMilestone[]>({
    queryKey: ['/api/projects', projectId, 'milestones'],
    enabled: !!projectId && isOpen,
  });

  // Form setup
  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      projectId,
      parentTaskId: parentTaskId || null,
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      estimatedHours: '',
      estimatedCost: '',
      completionPercentage: 0,
      requiresClientPresence: false,
      requiresPermits: false,
      displayOrder: 0,
      taskType: '',
      notes: '',
      customFields: {},
      createSubtasks: false
    }
  });

  // Load edit task data
  useEffect(() => {
    if (editTask && isOpen) {
      form.reset({
        projectId: editTask.projectId,
        parentTaskId: editTask.parentTaskId,
        milestoneId: editTask.milestoneId,
        title: editTask.title,
        description: editTask.description || '',
        status: editTask.status,
        priority: editTask.priority,
        estimatedStartDate: editTask.estimatedStartDate ? format(new Date(editTask.estimatedStartDate), 'yyyy-MM-dd') : '',
        estimatedEndDate: editTask.estimatedEndDate ? format(new Date(editTask.estimatedEndDate), 'yyyy-MM-dd') : '',
        estimatedHours: editTask.estimatedHours || '',
        estimatedCost: editTask.estimatedCost || '',
        assignedTo: editTask.assignedTo || '',
        completionPercentage: editTask.completionPercentage || 0,
        taskType: editTask.taskType || '',
        requiresClientPresence: editTask.requiresClientPresence || false,
        requiresPermits: editTask.requiresPermits || false,
        displayOrder: editTask.displayOrder || 0,
        notes: editTask.notes || '',
        customFields: editTask.customFields || {},
        createSubtasks: false
      });
      setCustomFields(editTask.customFields || {});
    }
  }, [editTask, isOpen, form]);

  // Available parent tasks (exclude current task and its descendants if editing)
  const availableParentTasks = useMemo(() => {
    let filtered = tasks.filter(task => task.id !== editTask?.id);
    
    // If editing, also exclude descendants to prevent circular relationships
    if (editTask) {
      const getDescendantIds = (taskId: number): number[] => {
        const children = tasks.filter(t => t.parentTaskId === taskId);
        let descendants = children.map(c => c.id);
        children.forEach(child => {
          descendants = descendants.concat(getDescendantIds(child.id));
        });
        return descendants;
      };
      
      const descendantIds = getDescendantIds(editTask.id);
      filtered = filtered.filter(task => !descendantIds.includes(task.id));
    }
    
    return filtered;
  }, [tasks, editTask]);

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (taskData: InsertProjectTask) => {
      return await apiRequest('/api/tasks', {
        method: 'POST',
        body: taskData
      });
    },
    onSuccess: (newTask) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      toast({ title: editTask ? "Task updated successfully" : "Task created successfully" });
      onSuccess?.(newTask);
      onOpenChange(false);
      form.reset();
      setSelectedTemplate(null);
      setCustomFields({});
    },
    onError: (error: any) => {
      toast({ 
        title: editTask ? "Failed to update task" : "Failed to create task", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async (taskData: Partial<InsertProjectTask>) => {
      return await apiRequest(`/api/tasks/${editTask!.id}`, {
        method: 'PUT',
        body: taskData
      });
    },
    onSuccess: (updatedTask) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      toast({ title: "Task updated successfully" });
      onSuccess?.(updatedTask);
      onOpenChange(false);
      form.reset();
      setCustomFields({});
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update task", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Create subtasks mutation
  const createSubtasksMutation = useMutation({
    mutationFn: async ({ parentTaskId, subtasks }: { parentTaskId: number, subtasks: any[] }) => {
      const promises = subtasks.map(subtask => 
        apiRequest('/api/tasks', {
          method: 'POST',
          body: { ...subtask, projectId, parentTaskId }
        })
      );
      return await Promise.all(promises);
    }
  });

  // Calculate estimated cost based on hours and average crew rate
  const calculateEstimatedCost = (hours: number): number => {
    const averageRate = 35; // Default hourly rate
    return hours * averageRate;
  };

  // Apply template
  const applyTemplate = (template: TaskTemplate) => {
    form.setValue('title', template.name);
    form.setValue('description', template.description);
    form.setValue('estimatedHours', template.estimatedHours.toString());
    form.setValue('estimatedCost', calculateEstimatedCost(template.estimatedHours).toString());
    form.setValue('priority', template.priority as any);
    form.setValue('taskType', template.taskType);
    form.setValue('createSubtasks', template.subtasks && template.subtasks.length > 0);
    setSelectedTemplate(template);
  };

  // Handle form submission
  const onSubmit = async (data: TaskFormData) => {
    try {
      const taskData: InsertProjectTask = {
        ...data,
        customFields: Object.keys(customFields).length > 0 ? customFields : null,
        estimatedStartDate: data.estimatedStartDate ? new Date(data.estimatedStartDate) : null,
        estimatedEndDate: data.estimatedEndDate ? new Date(data.estimatedEndDate) : null,
      };

      if (editTask) {
        // Update existing task
        await updateTaskMutation.mutateAsync(taskData);
      } else {
        // Create new task
        const newTask = await createTaskMutation.mutateAsync(taskData);
        
        // Create subtasks if template selected and createSubtasks is true
        if (data.createSubtasks && selectedTemplate?.subtasks && newTask) {
          await createSubtasksMutation.mutateAsync({
            parentTaskId: newTask.id,
            subtasks: selectedTemplate.subtasks.map(subtask => ({
              title: subtask.title,
              description: subtask.description,
              estimatedHours: subtask.estimatedHours.toString(),
              displayOrder: subtask.displayOrder,
              status: 'pending',
              priority: 'medium'
            }))
          });
        }
      }
    } catch (error) {
      console.error('Error submitting task:', error);
    }
  };

  const handleCustomFieldChange = (key: string, value: any) => {
    setCustomFields(prev => ({ ...prev, [key]: value }));
  };

  const addCustomField = () => {
    const fieldName = prompt('Enter field name:');
    if (fieldName && !customFields[fieldName]) {
      setCustomFields(prev => ({ ...prev, [fieldName]: '' }));
    }
  };

  const removeCustomField = (key: string) => {
    setCustomFields(prev => {
      const { [key]: removed, ...rest } = prev;
      return rest;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Plus className="mr-2 h-5 w-5" />
            {editTask ? 'Edit Task' : 'Create New Task'}
            {parentTaskId && (
              <Badge variant="outline" className="ml-2">
                Subtask
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Task Templates (only for new tasks) */}
              {!editTask && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center">
                      <Layers className="mr-2 h-4 w-4" />
                      Task Templates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {TASK_TEMPLATES.map((template) => (
                        <Card 
                          key={template.id} 
                          className={cn(
                            "cursor-pointer transition-all hover:shadow-md border-2",
                            selectedTemplate?.id === template.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
                          )}
                          onClick={() => applyTemplate(template)}
                          data-testid={`template-${template.id}`}
                        >
                          <CardContent className="p-4">
                            <h4 className="font-medium text-sm mb-1">{template.name}</h4>
                            <p className="text-xs text-gray-600 mb-2">{template.description}</p>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>{template.estimatedHours}h</span>
                              <Badge variant="outline" className="text-xs">
                                {template.priority}
                              </Badge>
                            </div>
                            {template.subtasks && (
                              <p className="text-xs text-blue-600 mt-1">
                                +{template.subtasks.length} subtasks
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Task Title *</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Enter task title"
                              data-testid="task-title-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="taskType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Task Type</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="task-type-select">
                                <SelectValue placeholder="Select task type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {TASK_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
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
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            rows={3}
                            placeholder="Detailed task description..."
                            data-testid="task-description-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="task-status-select">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="blocked">Blocked</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="task-priority-select">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="completionPercentage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Progress (%)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              min="0"
                              max="100"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="task-progress-input"
                            />
                          </FormControl>
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
                            <Input 
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="task-order-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Hierarchy and Assignment */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Users className="mr-2 h-4 w-4" />
                    Hierarchy & Assignment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="parentTaskId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Parent Task</FormLabel>
                          <Select 
                            value={field.value?.toString() || ''} 
                            onValueChange={(value) => field.onChange(value ? parseInt(value) : null)}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="task-parent-select">
                                <SelectValue placeholder="No parent task" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="">No parent task</SelectItem>
                              {availableParentTasks.map((task) => (
                                <SelectItem key={task.id} value={task.id.toString()}>
                                  <div className="flex items-center space-x-2">
                                    <span className="truncate max-w-48">{task.title}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {task.status}
                                    </Badge>
                                  </div>
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
                      name="milestoneId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Milestone</FormLabel>
                          <Select 
                            value={field.value?.toString() || ''} 
                            onValueChange={(value) => field.onChange(value ? parseInt(value) : null)}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="task-milestone-select">
                                <SelectValue placeholder="No milestone" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="">No milestone</SelectItem>
                              {milestones.map((milestone) => (
                                <SelectItem key={milestone.id} value={milestone.id.toString()}>
                                  <div className="flex items-center space-x-2">
                                    <Target className="h-3 w-3" />
                                    <span>{milestone.name}</span>
                                  </div>
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
                      name="assignedTo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assigned To</FormLabel>
                          <Select value={field.value || ''} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="task-assignee-select">
                                <SelectValue placeholder="Unassigned" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="">Unassigned</SelectItem>
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  <div className="flex items-center space-x-2">
                                    <Avatar className="h-5 w-5">
                                      <AvatarFallback className="text-xs">
                                        {user.firstName?.[0]}{user.lastName?.[0]}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span>{user.firstName} {user.lastName}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Schedule and Resources */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Calendar className="mr-2 h-4 w-4" />
                    Schedule & Resources
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="estimatedStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated Start</FormLabel>
                          <FormControl>
                            <Input 
                              type="date"
                              {...field}
                              data-testid="task-start-date-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="estimatedEndDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated End</FormLabel>
                          <FormControl>
                            <Input 
                              type="date"
                              {...field}
                              data-testid="task-end-date-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="estimatedHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated Hours</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              step="0.5"
                              placeholder="8"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e.target.value);
                                // Auto-calculate cost
                                const hours = parseFloat(e.target.value) || 0;
                                if (hours > 0) {
                                  form.setValue('estimatedCost', calculateEstimatedCost(hours).toString());
                                }
                              }}
                              data-testid="task-hours-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="estimatedCost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated Cost ($)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              step="0.01"
                              placeholder="280.00"
                              {...field}
                              data-testid="task-cost-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Requirements and Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    Requirements & Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="requiresClientPresence"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="task-client-presence-checkbox"
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Requires client presence
                            </FormLabel>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="requiresPermits"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="task-permits-checkbox"
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Requires permits
                            </FormLabel>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {!editTask && selectedTemplate?.subtasks && (
                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="createSubtasks"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="task-create-subtasks-checkbox"
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal">
                                Create template subtasks ({selectedTemplate.subtasks.length})
                              </FormLabel>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        {form.watch('createSubtasks') && (
                          <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded border">
                            <p className="font-medium mb-2">Subtasks will be created:</p>
                            <ul className="space-y-1">
                              {selectedTemplate.subtasks.map((subtask, index) => (
                                <li key={index} className="flex items-center text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-2 text-blue-600" />
                                  {subtask.title} ({subtask.estimatedHours}h)
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Advanced Options */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Advanced Options</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                      data-testid="toggle-advanced-options"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      {showAdvancedOptions ? 'Hide' : 'Show'} Advanced
                    </Button>
                  </div>
                </CardHeader>
                {showAdvancedOptions && (
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Additional Notes</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              rows={3}
                              placeholder="Internal notes, special instructions, etc."
                              data-testid="task-notes-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Custom Fields */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Custom Fields</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addCustomField}
                          data-testid="add-custom-field-button"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Field
                        </Button>
                      </div>
                      
                      {Object.keys(customFields).length === 0 ? (
                        <div className="text-sm text-gray-500 text-center py-4 border border-dashed rounded">
                          No custom fields defined
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(customFields).map(([key, value]) => (
                            <div key={key} className="flex items-center space-x-2">
                              <Label className="text-sm min-w-0 w-24 truncate">{key}:</Label>
                              <Input
                                value={value}
                                onChange={(e) => handleCustomFieldChange(key, e.target.value)}
                                className="flex-1"
                                data-testid={`custom-field-${key}`}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeCustomField(key)}
                                className="text-red-600 hover:text-red-700"
                                data-testid={`remove-custom-field-${key}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* Form Actions */}
              <div className="flex justify-end space-x-2 pt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    form.reset();
                    setSelectedTemplate(null);
                    setCustomFields({});
                  }}
                  data-testid="task-form-cancel-button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createTaskMutation.isPending || updateTaskMutation.isPending}
                  data-testid="task-form-save-button"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {editTask ? 'Update Task' : 'Create Task'}
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default TaskFormModal;