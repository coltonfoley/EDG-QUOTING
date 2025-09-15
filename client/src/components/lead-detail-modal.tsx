import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  User, 
  Mail, 
  Phone, 
  Building, 
  DollarSign, 
  Calendar as CalendarIcon,
  Clock,
  CheckSquare,
  Plus,
  Edit,
  Trash2,
  AlertCircle,
  UserPlus,
  Filter,
  ChevronDown,
  X,
  Save,
  ArrowRight
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Lead, Task, LeadActivity, User as UserType, InsertTask, InsertLeadActivity } from "@shared/schema";
import { insertTaskSchema, insertLeadActivitySchema } from "@shared/schema";

interface LeadDetailModalProps {
  leadId: number | null;
  open: boolean;
  onClose: () => void;
  users?: UserType[];
}

// Extended lead type with tasks and activities
interface LeadWithDetails extends Lead {
  tasks: Task[];
  activities: LeadActivity[];
}

// Task form schema
const taskFormSchema = insertTaskSchema.extend({
  dueDate: z.date().optional()
});

type TaskFormData = z.infer<typeof taskFormSchema>;

// Lead update schema
const leadUpdateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional().transform(val => val ? val.toString() : undefined),
  source: z.string().optional(),
  notes: z.string().optional(),
  assignedTo: z.string().optional(),
  status: z.enum(['new', 'contacted', 'quoted', 'won', 'lost']),
});

type LeadUpdateData = z.infer<typeof leadUpdateSchema>;

export function LeadDetailModal({ leadId, open, onClose, users = [] }: LeadDetailModalProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "completed" | "overdue">("all");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingLead, setEditingLead] = useState(false);
  const { toast } = useToast();

  // Fetch lead details with tasks and activities
  const { data: lead, isLoading, error } = useQuery<LeadWithDetails>({
    queryKey: ["/api/leads", leadId],
    enabled: !!leadId && open,
    staleTime: 30000, // 30 seconds
  });

  // Lead update form
  const leadForm = useForm<LeadUpdateData>({
    resolver: zodResolver(leadUpdateSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      value: "",
      source: "",
      notes: "",
      assignedTo: "",
      status: "new",
    },
  });

  // Task form
  const taskForm = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      completed: false,
      dueDate: undefined,
    },
  });

  // Update lead form when data changes
  useEffect(() => {
    if (lead) {
      leadForm.reset({
        name: lead.name,
        email: lead.email || "",
        phone: lead.phone || "",
        company: lead.company || "",
        value: lead.value?.toString() || "",
        source: lead.source || "",
        notes: lead.notes || "",
        assignedTo: lead.assignedTo || "",
        status: lead.status,
      });
    }
  }, [lead, leadForm]);

  // Update lead mutation
  const updateLeadMutation = useMutation({
    mutationFn: async (data: LeadUpdateData) => {
      if (!leadId) throw new Error("No lead ID");
      return await apiRequest("PUT", `/api/leads/${leadId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      setEditingLead(false);
      toast({
        title: "Lead updated",
        description: "Lead information has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update lead",
        variant: "destructive",
      });
    },
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      if (!leadId) throw new Error("No lead ID");
      return await apiRequest("POST", "/api/tasks", {
        ...data,
        leadId,
        dueDate: data.dueDate?.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      taskForm.reset();
      setShowTaskForm(false);
      toast({
        title: "Task created",
        description: "New task has been added to this lead.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create task",
        variant: "destructive",
      });
    },
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: number; data: Partial<TaskFormData> }) => {
      return await apiRequest("PUT", `/api/tasks/${taskId}`, {
        ...data,
        dueDate: data.dueDate?.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      setEditingTask(null);
      toast({
        title: "Task updated",
        description: "Task has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update task",
        variant: "destructive",
      });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return await apiRequest("DELETE", `/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      toast({
        title: "Task deleted",
        description: "Task has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete task",
        variant: "destructive",
      });
    },
  });

  // Toggle task completion
  const toggleTaskCompletion = (task: Task) => {
    updateTaskMutation.mutate({
      taskId: task.id,
      data: { completed: !task.completed }
    });
  };

  // Add activity mutation
  const addActivityMutation = useMutation({
    mutationFn: async (data: { activityType: string; description: string; metadata?: any }) => {
      if (!leadId) throw new Error("No lead ID");
      return await apiRequest("POST", `/api/leads/${leadId}/activities`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
    },
  });

  // Delete lead mutation
  const deleteLeadMutation = useMutation({
    mutationFn: async () => {
      if (!leadId) throw new Error("No lead ID");
      return await apiRequest("DELETE", `/api/leads/${leadId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      onClose();
      toast({
        title: "Lead deleted",
        description: "Lead has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete lead",
        variant: "destructive",
      });
    },
  });

  // Convert to customer mutation
  const convertToCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!leadId) throw new Error("No lead ID");
      return await apiRequest("POST", `/api/leads/${leadId}/convert-to-customer`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "Lead converted",
        description: "Lead has been successfully converted to a customer.",
      });
      // Log activity
      addActivityMutation.mutate({
        activityType: 'customer_converted',
        description: 'Lead converted to customer',
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to convert lead",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setEditingLead(false);
    setEditingTask(null);
    setShowTaskForm(false);
    setActiveTab("overview");
    onClose();
  };

  const handleLeadSubmit = (data: LeadUpdateData) => {
    updateLeadMutation.mutate(data);
  };

  const handleTaskSubmit = (data: TaskFormData) => {
    if (editingTask) {
      updateTaskMutation.mutate({
        taskId: editingTask.id,
        data
      });
    } else {
      createTaskMutation.mutate(data);
    }
  };

  // Filter tasks based on current filter
  const filteredTasks = lead?.tasks?.filter(task => {
    switch (taskFilter) {
      case "pending":
        return !task.completed;
      case "completed":
        return task.completed;
      case "overdue":
        return !task.completed && task.dueDate && new Date(task.dueDate) < new Date();
      default:
        return true;
    }
  }) || [];

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-gray-100 text-gray-800";
      case "contacted":
        return "bg-blue-100 text-blue-800";
      case "quoted":
        return "bg-orange-100 text-orange-800";
      case "won":
        return "bg-green-100 text-green-800";
      case "lost":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-600";
      case "medium":
        return "text-yellow-600";
      case "low":
        return "text-green-600";
      default:
        return "text-gray-600";
    }
  };

  // Get activity icon
  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case "status_change":
        return <ArrowRight className="h-4 w-4 text-white" />;
      case "task_completed":
        return <CheckSquare className="h-4 w-4 text-white" />;
      case "note_added":
        return <Edit className="h-4 w-4 text-white" />;
      case "email_sent":
        return <Mail className="h-4 w-4 text-white" />;
      case "call_made":
        return <Phone className="h-4 w-4 text-white" />;
      case "customer_converted":
        return <UserPlus className="h-4 w-4 text-white" />;
      case "meeting_scheduled":
        return <CalendarIcon className="h-4 w-4 text-white" />;
      case "quote_sent":
        return <DollarSign className="h-4 w-4 text-white" />;
      default:
        return <Clock className="h-4 w-4 text-white" />;
    }
  };

  // Get activity type background color
  const getActivityTypeColor = (activityType: string) => {
    switch (activityType) {
      case "status_change":
        return "bg-blue-500";
      case "task_completed":
        return "bg-green-500";
      case "note_added":
        return "bg-gray-500";
      case "email_sent":
        return "bg-purple-500";
      case "call_made":
        return "bg-orange-500";
      case "customer_converted":
        return "bg-emerald-500";
      case "meeting_scheduled":
        return "bg-indigo-500";
      case "quote_sent":
        return "bg-yellow-500";
      default:
        return "bg-gray-400";
    }
  };

  // Get activity type badge color
  const getActivityTypeBadgeColor = (activityType: string) => {
    switch (activityType) {
      case "status_change":
        return "text-blue-700 border-blue-300";
      case "task_completed":
        return "text-green-700 border-green-300";
      case "note_added":
        return "text-gray-700 border-gray-300";
      case "email_sent":
        return "text-purple-700 border-purple-300";
      case "call_made":
        return "text-orange-700 border-orange-300";
      case "customer_converted":
        return "text-emerald-700 border-emerald-300";
      case "meeting_scheduled":
        return "text-indigo-700 border-indigo-300";
      case "quote_sent":
        return "text-yellow-700 border-yellow-300";
      default:
        return "text-gray-700 border-gray-300";
    }
  };

  if (!open || !leadId) return null;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl h-[80vh] overflow-hidden">
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-edg-teal"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error || !lead) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load lead details. Please try again.
            </AlertDescription>
          </Alert>
          <div className="flex justify-end space-x-2 mt-4">
            <Button onClick={handleClose} variant="outline">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl h-[90vh] overflow-hidden" data-testid="lead-detail-modal">
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold" data-testid="modal-title">
              {lead.name}
            </DialogTitle>
            <div className="flex items-center space-x-2">
              <Badge className={getStatusColor(lead.status)} data-testid="lead-status-badge">
                {lead.status ? lead.status.charAt(0).toUpperCase() + lead.status.slice(1) : 'Unknown'}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                data-testid="button-close-modal"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4" data-testid="modal-tabs">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="tasks" data-testid="tab-tasks">
                Tasks ({lead.tasks?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="activities" data-testid="tab-activities">
                Activities ({lead.activities?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="actions" data-testid="tab-actions">Actions</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-hidden">
              <TabsContent value="overview" className="h-full overflow-y-auto mt-4 pr-2" data-testid="tab-content-overview">
                {/* Lead Information Section */}
                <Card className="mb-6">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg">Lead Information</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingLead(!editingLead)}
                      data-testid="button-edit-lead"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      {editingLead ? "Cancel" : "Edit"}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {editingLead ? (
                      <Form {...leadForm}>
                        <form onSubmit={leadForm.handleSubmit(handleLeadSubmit)} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={leadForm.control}
                              name="name"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Name *</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-edit-name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={leadForm.control}
                              name="company"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Company</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-edit-company" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={leadForm.control}
                              name="email"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Email</FormLabel>
                                  <FormControl>
                                    <Input type="email" {...field} data-testid="input-edit-email" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={leadForm.control}
                              name="phone"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Phone</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-edit-phone" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-3 gap-4">
                            <FormField
                              control={leadForm.control}
                              name="value"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Estimated Value</FormLabel>
                                  <FormControl>
                                    <Input type="number" step="0.01" {...field} data-testid="input-edit-value" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={leadForm.control}
                              name="source"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Source</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-edit-source">
                                        <SelectValue placeholder="Select source" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="web">Website</SelectItem>
                                      <SelectItem value="referral">Referral</SelectItem>
                                      <SelectItem value="cold_call">Cold Call</SelectItem>
                                      <SelectItem value="trade_show">Trade Show</SelectItem>
                                      <SelectItem value="social_media">Social Media</SelectItem>
                                      <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={leadForm.control}
                              name="status"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Status</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-edit-status">
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="new">New</SelectItem>
                                      <SelectItem value="contacted">Contacted</SelectItem>
                                      <SelectItem value="quoted">Quoted</SelectItem>
                                      <SelectItem value="won">Won</SelectItem>
                                      <SelectItem value="lost">Lost</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={leadForm.control}
                            name="assignedTo"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Assigned To</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-edit-assigned">
                                      <SelectValue placeholder="Select user" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    {users.map((user) => (
                                      <SelectItem key={user.id} value={user.id}>
                                        {user.firstName && user.lastName
                                          ? `${user.firstName} ${user.lastName}`
                                          : user.username}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={leadForm.control}
                            name="notes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Notes</FormLabel>
                                <FormControl>
                                  <Textarea 
                                    {...field} 
                                    rows={3}
                                    placeholder="Add any notes about this lead..."
                                    data-testid="textarea-edit-notes"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="flex justify-end space-x-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setEditingLead(false)}
                              data-testid="button-cancel-edit"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              disabled={updateLeadMutation.isPending}
                              data-testid="button-save-lead"
                            >
                              {updateLeadMutation.isPending ? "Saving..." : "Save Changes"}
                            </Button>
                          </div>
                        </form>
                      </Form>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                              <User className="h-4 w-4 text-edg-grey" />
                              <span className="text-sm text-edg-grey">Contact</span>
                            </div>
                            <div className="ml-6 space-y-1">
                              <p className="font-medium" data-testid="display-lead-name">{lead.name}</p>
                              {lead.email && (
                                <div className="flex items-center space-x-2 text-sm text-edg-grey">
                                  <Mail className="h-3 w-3" />
                                  <span data-testid="display-lead-email">{lead.email}</span>
                                </div>
                              )}
                              {lead.phone && (
                                <div className="flex items-center space-x-2 text-sm text-edg-grey">
                                  <Phone className="h-3 w-3" />
                                  <span data-testid="display-lead-phone">{lead.phone}</span>
                                </div>
                              )}
                              {lead.company && (
                                <div className="flex items-center space-x-2 text-sm text-edg-grey">
                                  <Building className="h-3 w-3" />
                                  <span data-testid="display-lead-company">{lead.company}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                              <DollarSign className="h-4 w-4 text-edg-grey" />
                              <span className="text-sm text-edg-grey">Project Details</span>
                            </div>
                            <div className="ml-6 space-y-2">
                              {lead.value && (
                                <div>
                                  <span className="text-sm text-edg-grey">Estimated Value: </span>
                                  <span className="font-medium" data-testid="display-lead-value">
                                    {formatCurrency(parseFloat(lead.value.toString()))}
                                  </span>
                                </div>
                              )}
                              {lead.source && (
                                <div>
                                  <span className="text-sm text-edg-grey">Source: </span>
                                  <span className="capitalize" data-testid="display-lead-source">
                                    {lead.source.replace('_', ' ')}
                                  </span>
                                </div>
                              )}
                              {lead.assignedTo && (
                                <div>
                                  <span className="text-sm text-edg-grey">Assigned to: </span>
                                  <div className="inline-flex items-center space-x-2">
                                    <Avatar className="h-5 w-5">
                                      <AvatarFallback className="text-xs bg-edg-teal text-white">
                                        {users.find(u => u.id === lead.assignedTo)?.username?.charAt(0).toUpperCase() || 'U'}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span data-testid="display-lead-assigned">
                                      {users.find(u => u.id === lead.assignedTo)?.username || 'Unknown User'}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <CalendarIcon className="h-4 w-4 text-edg-grey" />
                            <span className="text-sm text-edg-grey">Timeline</span>
                          </div>
                          <div className="ml-6 text-sm space-y-1">
                            <div>
                              <span className="text-edg-grey">Created: </span>
                              <span data-testid="display-lead-created">
                                {lead.createdAt ? formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true }) : 'Unknown'}
                              </span>
                            </div>
                            {lead.updatedAt && (
                              <div>
                                <span className="text-edg-grey">Last updated: </span>
                                <span data-testid="display-lead-updated">
                                  {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {lead.notes && (
                          <>
                            <Separator />
                            <div className="space-y-2">
                              <span className="text-sm text-edg-grey">Notes</span>
                              <p className="text-sm bg-gray-50 p-3 rounded-md" data-testid="display-lead-notes">
                                {lead.notes}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-edg-grey">Total Tasks</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="stat-total-tasks">
                        {lead.tasks?.length || 0}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-edg-grey">Completed Tasks</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600" data-testid="stat-completed-tasks">
                        {lead.tasks?.filter(t => t.completed).length || 0}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-edg-grey">Activities</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="stat-activities">
                        {lead.activities?.length || 0}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Tasks Tab */}
              <TabsContent value="tasks" className="h-full overflow-y-auto mt-4 pr-2" data-testid="tab-content-tasks">
                <div className="space-y-4">
                  {/* Task Header and Controls */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
                    <div className="flex items-center space-x-4">
                      <h3 className="text-lg font-semibold">Tasks ({filteredTasks.length})</h3>
                      <div className="flex items-center space-x-2">
                        <Filter className="h-4 w-4 text-edg-grey" />
                        <Select value={taskFilter} onValueChange={(value: any) => setTaskFilter(value)}>
                          <SelectTrigger className="w-32" data-testid="select-task-filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      onClick={() => setShowTaskForm(!showTaskForm)}
                      size="sm"
                      data-testid="button-add-task"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Task
                    </Button>
                  </div>

                  {/* Add/Edit Task Form */}
                  {(showTaskForm || editingTask) && (
                    <Card className="bg-blue-50 border-blue-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          {editingTask ? "Edit Task" : "Add New Task"}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Form {...taskForm}>
                          <form
                            onSubmit={taskForm.handleSubmit(handleTaskSubmit)}
                            className="space-y-4"
                          >
                            <FormField
                              control={taskForm.control}
                              name="title"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Task Title *</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Enter task title" data-testid="input-task-title" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={taskForm.control}
                              name="description"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Description</FormLabel>
                                  <FormControl>
                                    <Textarea 
                                      {...field} 
                                      placeholder="Task description (optional)"
                                      rows={2}
                                      data-testid="textarea-task-description"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <FormField
                                control={taskForm.control}
                                name="priority"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Priority</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl>
                                        <SelectTrigger data-testid="select-task-priority">
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={taskForm.control}
                                name="assignedTo"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Assign To</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl>
                                        <SelectTrigger data-testid="select-task-assigned">
                                          <SelectValue placeholder="Select user" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                        {users.map((user) => (
                                          <SelectItem key={user.id} value={user.id}>
                                            {user.firstName && user.lastName
                                              ? `${user.firstName} ${user.lastName}`
                                              : user.username}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={taskForm.control}
                                name="dueDate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Due Date</FormLabel>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <FormControl>
                                          <Button
                                            variant="outline"
                                            className={cn(
                                              "w-full justify-start text-left font-normal",
                                              !field.value && "text-muted-foreground"
                                            )}
                                            data-testid="button-task-due-date"
                                          >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {field.value ? (
                                              field.value.toLocaleDateString()
                                            ) : (
                                              <span>Pick a date</span>
                                            )}
                                          </Button>
                                        </FormControl>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                          mode="single"
                                          selected={field.value}
                                          onSelect={field.onChange}
                                          disabled={(date) => date < new Date()}
                                          initialFocus
                                        />
                                      </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            <div className="flex justify-end space-x-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setShowTaskForm(false);
                                  setEditingTask(null);
                                  taskForm.reset();
                                }}
                                data-testid="button-cancel-task"
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                disabled={createTaskMutation.isPending || updateTaskMutation.isPending}
                                data-testid="button-save-task"
                              >
                                {createTaskMutation.isPending || updateTaskMutation.isPending
                                  ? "Saving..."
                                  : editingTask
                                  ? "Update Task"
                                  : "Create Task"}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </CardContent>
                    </Card>
                  )}

                  {/* Tasks List */}
                  <div className="space-y-3">
                    {filteredTasks.length === 0 ? (
                      <Card>
                        <CardContent className="py-8">
                          <div className="text-center text-edg-grey">
                            <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium mb-2">No tasks found</p>
                            <p className="text-sm">
                              {taskFilter === "all"
                                ? "Get started by adding your first task."
                                : `No ${taskFilter} tasks for this lead.`}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      filteredTasks
                        .sort((a, b) => {
                          // Sort by priority first (high -> medium -> low), then by due date
                          const priorityOrder = { high: 3, medium: 2, low: 1 };
                          const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 1;
                          const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 1;
                          
                          if (aPriority !== bPriority) {
                            return bPriority - aPriority;
                          }
                          
                          // If same priority, sort by due date (earliest first)
                          if (a.dueDate && b.dueDate) {
                            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                          }
                          if (a.dueDate && !b.dueDate) return -1;
                          if (!a.dueDate && b.dueDate) return 1;
                          
                          // If no due dates, sort by creation date (newest first)
                          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
                        })
                        .map((task) => {
                          const isOverdue = !task.completed && task.dueDate && new Date(task.dueDate) < new Date();
                          
                          return (
                            <Card
                              key={task.id}
                              className={cn(
                                "transition-all duration-200 hover:shadow-md",
                                task.completed && "opacity-75",
                                isOverdue && "border-red-200 bg-red-50"
                              )}
                              data-testid={`task-card-${task.id}`}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between space-x-3">
                                  <div className="flex items-start space-x-3 flex-1 min-w-0">
                                    <Checkbox
                                      checked={task.completed}
                                      onCheckedChange={() => toggleTaskCompletion(task)}
                                      className="mt-1"
                                      data-testid={`checkbox-task-${task.id}`}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center space-x-2 mb-2">
                                        <h4
                                          className={cn(
                                            "font-medium",
                                            task.completed && "line-through text-edg-grey"
                                          )}
                                          data-testid={`task-title-${task.id}`}
                                        >
                                          {task.title}
                                        </h4>
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "text-xs",
                                            getPriorityColor(task.priority)
                                          )}
                                          data-testid={`task-priority-${task.id}`}
                                        >
                                          {task.priority}
                                        </Badge>
                                      </div>

                                      {task.description && (
                                        <p
                                          className={cn(
                                            "text-sm text-edg-grey mb-2",
                                            task.completed && "line-through"
                                          )}
                                          data-testid={`task-description-${task.id}`}
                                        >
                                          {task.description}
                                        </p>
                                      )}

                                      <div className="flex items-center space-x-4 text-xs text-edg-grey">
                                        {task.dueDate && (
                                          <div className="flex items-center space-x-1">
                                            <CalendarIcon className="h-3 w-3" />
                                            <span
                                              className={cn(
                                                isOverdue && !task.completed && "text-red-600 font-medium"
                                              )}
                                              data-testid={`task-due-date-${task.id}`}
                                            >
                                              {new Date(task.dueDate).toLocaleDateString()}
                                              {isOverdue && !task.completed && " (Overdue)"}
                                            </span>
                                          </div>
                                        )}

                                        {task.assignedTo && (
                                          <div className="flex items-center space-x-1">
                                            <User className="h-3 w-3" />
                                            <span data-testid={`task-assigned-${task.id}`}>
                                              {users.find(u => u.id === task.assignedTo)?.username || 'Unknown'}
                                            </span>
                                          </div>
                                        )}

                                        <div className="flex items-center space-x-1">
                                          <Clock className="h-3 w-3" />
                                          <span data-testid={`task-created-${task.id}`}>
                                            Created {task.createdAt ? formatDistanceToNow(new Date(task.createdAt), { addSuffix: true }) : 'Unknown'}
                                          </span>
                                        </div>

                                        {task.completedAt && (
                                          <div className="flex items-center space-x-1">
                                            <CheckSquare className="h-3 w-3 text-green-600" />
                                            <span data-testid={`task-completed-${task.id}`}>
                                              Completed {formatDistanceToNow(new Date(task.completedAt), { addSuffix: true })}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingTask(task);
                                        setShowTaskForm(false);
                                        taskForm.reset({
                                          title: task.title,
                                          description: task.description || "",
                                          priority: task.priority,
                                          assignedTo: task.assignedTo || "",
                                          completed: task.completed,
                                          dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
                                        });
                                      }}
                                      data-testid={`button-edit-task-${task.id}`}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-red-600 hover:text-red-700"
                                          data-testid={`button-delete-task-${task.id}`}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Task</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to delete the task "{task.title}"? This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => deleteTaskMutation.mutate(task.id)}
                                            className="bg-red-600 hover:bg-red-700"
                                          >
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Activities Tab */}
              <TabsContent value="activities" className="h-full overflow-y-auto mt-4 pr-2" data-testid="tab-content-activities">
                <div className="space-y-4">
                  {/* Activity Header */}
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Activity Timeline ({lead.activities?.length || 0})</h3>
                    <Button
                      size="sm"
                      onClick={() => {
                        const description = prompt("Add a note to this lead:");
                        if (description?.trim()) {
                          addActivityMutation.mutate({
                            activityType: 'note_added',
                            description,
                          });
                        }
                      }}
                      data-testid="button-add-note"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Note
                    </Button>
                  </div>

                  {/* Activity Timeline */}
                  <div className="space-y-4">
                    {!lead.activities || lead.activities.length === 0 ? (
                      <Card>
                        <CardContent className="py-8">
                          <div className="text-center text-edg-grey">
                            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium mb-2">No activities yet</p>
                            <p className="text-sm">Activities and interactions will appear here as they happen.</p>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute left-6 top-6 bottom-6 w-px bg-gray-200"></div>
                        
                        <div className="space-y-6">
                          {lead.activities
                            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                            .map((activity, index) => {
                              const isFirst = index === 0;
                              const user = users.find(u => u.id === activity.userId);
                              
                              return (
                                <div
                                  key={activity.id}
                                  className="relative flex items-start space-x-4"
                                  data-testid={`activity-${activity.id}`}
                                >
                                  {/* Timeline dot and icon */}
                                  <div className={cn(
                                    "relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 bg-white",
                                    isFirst ? "border-edg-teal" : "border-gray-200"
                                  )}>
                                    <div className={cn(
                                      "flex items-center justify-center w-8 h-8 rounded-full",
                                      getActivityTypeColor(activity.activityType)
                                    )}>
                                      {getActivityIcon(activity.activityType)}
                                    </div>
                                  </div>

                                  {/* Activity content */}
                                  <div className="flex-1 min-w-0">
                                    <Card className={cn(
                                      "transition-all duration-200",
                                      isFirst && "border-edg-teal/20 bg-edg-teal/5"
                                    )}>
                                      <CardContent className="p-4">
                                        <div className="flex items-start justify-between mb-2">
                                          <div className="flex items-center space-x-2">
                                            <Badge
                                              variant="outline"
                                              className={cn(
                                                "text-xs capitalize",
                                                getActivityTypeBadgeColor(activity.activityType)
                                              )}
                                              data-testid={`activity-type-${activity.id}`}
                                            >
                                              {activity.activityType.replace('_', ' ')}
                                            </Badge>
                                            {user && (
                                              <div className="flex items-center space-x-1 text-xs text-edg-grey">
                                                <User className="h-3 w-3" />
                                                <span data-testid={`activity-user-${activity.id}`}>
                                                  {user.firstName && user.lastName
                                                    ? `${user.firstName} ${user.lastName}`
                                                    : user.username}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                          <time
                                            className="text-xs text-edg-grey"
                                            data-testid={`activity-time-${activity.id}`}
                                          >
                                            {activity.createdAt
                                              ? formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })
                                              : 'Unknown time'}
                                          </time>
                                        </div>

                                        <p
                                          className="text-sm text-edg-black mb-2"
                                          data-testid={`activity-description-${activity.id}`}
                                        >
                                          {activity.description}
                                        </p>

                                        {/* Activity metadata */}
                                        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                                          <div className="mt-3 p-2 bg-gray-50 rounded text-xs">
                                            <span className="text-edg-grey">Details:</span>
                                            <div className="mt-1 space-y-1">
                                              {Object.entries(activity.metadata).map(([key, value]) => (
                                                <div key={key} className="flex justify-between">
                                                  <span className="capitalize text-edg-grey">
                                                    {key.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                                                  </span>
                                                  <span className="font-medium">
                                                    {typeof value === 'string'
                                                      ? value
                                                      : typeof value === 'object'
                                                      ? JSON.stringify(value)
                                                      : String(value)}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </CardContent>
                                    </Card>
                                  </div>
                                </div>
                              );
                            })}
                        </div>

                        {/* Timeline end marker */}
                        <div className="relative flex items-center space-x-4 mt-6">
                          <div className="relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 border-gray-200 bg-white">
                            <div className="w-4 h-4 rounded-full bg-gray-300"></div>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-edg-grey">
                              Lead created {lead.createdAt ? formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true }) : 'at unknown time'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Actions Tab */}
              <TabsContent value="actions" className="h-full overflow-y-auto mt-4 pr-2" data-testid="tab-content-actions">
                <div className="space-y-6">
                  {/* Lead Actions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <UserPlus className="h-5 w-5 text-edg-teal" />
                        <span>Lead Actions</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Convert to Customer */}
                      {lead.status !== 'won' && !lead.customerId ? (
                        <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                          <div className="flex items-start space-x-3">
                            <UserPlus className="h-5 w-5 text-green-600 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="font-medium text-green-900 mb-2">Convert to Customer</h4>
                              <p className="text-sm text-green-700 mb-3">
                                Convert this lead to a customer. This will create a customer record and update the lead status to "won".
                              </p>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    data-testid="button-convert-to-customer"
                                  >
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Convert to Customer
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Convert Lead to Customer</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to convert "{lead.name}" to a customer? This will:
                                      <ul className="mt-2 ml-4 list-disc text-sm">
                                        <li>Create a new customer record</li>
                                        <li>Set lead status to "Won"</li>
                                        <li>Link the lead to the customer</li>
                                      </ul>
                                      This action cannot be easily undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => convertToCustomerMutation.mutate()}
                                      disabled={convertToCustomerMutation.isPending}
                                      className="bg-green-600 hover:bg-green-700"
                                    >
                                      {convertToCustomerMutation.isPending ? "Converting..." : "Convert to Customer"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                          <div className="flex items-center space-x-2">
                            <CheckSquare className="h-5 w-5 text-blue-600" />
                            <span className="text-sm font-medium text-blue-900">
                              {lead.customerId ? "Already converted to customer" : "Lead status is Won"}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Quick Actions */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-edg-grey mb-2">
                            Quick Status Change
                          </label>
                          <Select
                            value={lead.status}
                            onValueChange={(newStatus) => {
                              updateLeadMutation.mutate({
                                ...leadForm.getValues(),
                                status: newStatus as any
                              });
                            }}
                          >
                            <SelectTrigger data-testid="select-quick-status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="contacted">Contacted</SelectItem>
                              <SelectItem value="quoted">Quoted</SelectItem>
                              <SelectItem value="won">Won</SelectItem>
                              <SelectItem value="lost">Lost</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-edg-grey mb-2">
                            Quick Assignment
                          </label>
                          <Select
                            value={lead.assignedTo || ""}
                            onValueChange={(newAssignee) => {
                              updateLeadMutation.mutate({
                                ...leadForm.getValues(),
                                assignedTo: newAssignee || undefined
                              });
                            }}
                          >
                            <SelectTrigger data-testid="select-quick-assignment">
                              <SelectValue placeholder="Assign to user" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.firstName && user.lastName
                                    ? `${user.firstName} ${user.lastName}`
                                    : user.username}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Bulk Task Actions */}
                  {lead.tasks && lead.tasks.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                          <CheckSquare className="h-5 w-5 text-edg-teal" />
                          <span>Task Actions</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const incompleteTasks = lead.tasks?.filter(t => !t.completed) || [];
                              incompleteTasks.forEach(task => {
                                updateTaskMutation.mutate({
                                  taskId: task.id,
                                  data: { completed: true }
                                });
                              });
                            }}
                            disabled={updateTaskMutation.isPending || !lead.tasks?.some(t => !t.completed)}
                            data-testid="button-complete-all-tasks"
                          >
                            <CheckSquare className="h-4 w-4 mr-2" />
                            Complete All Tasks
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete all ${lead.tasks?.length} tasks?`)) {
                                lead.tasks?.forEach(task => {
                                  deleteTaskMutation.mutate(task.id);
                                });
                              }
                            }}
                            disabled={deleteTaskMutation.isPending}
                            data-testid="button-delete-all-tasks"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete All Tasks
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const assigneeId = prompt("Enter user ID to assign all tasks to:");
                              if (assigneeId) {
                                lead.tasks?.forEach(task => {
                                  updateTaskMutation.mutate({
                                    taskId: task.id,
                                    data: { assignedTo: assigneeId }
                                  });
                                });
                              }
                            }}
                            disabled={updateTaskMutation.isPending}
                            data-testid="button-assign-all-tasks"
                          >
                            <User className="h-4 w-4 mr-2" />
                            Assign All Tasks
                          </Button>
                        </div>

                        <div className="text-xs text-edg-grey">
                          <p>• Completed: {lead.tasks?.filter(t => t.completed).length || 0} tasks</p>
                          <p>• Pending: {lead.tasks?.filter(t => !t.completed).length || 0} tasks</p>
                          <p>• Overdue: {lead.tasks?.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length || 0} tasks</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Communication Actions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Mail className="h-5 w-5 text-edg-teal" />
                        <span>Communication</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {lead.email && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              window.open(`mailto:${lead.email}`, '_blank');
                              addActivityMutation.mutate({
                                activityType: 'email_sent',
                                description: `Email opened to ${lead.email}`,
                              });
                            }}
                            data-testid="button-send-email"
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            Send Email
                          </Button>
                        )}

                        {lead.phone && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              window.open(`tel:${lead.phone}`, '_blank');
                              addActivityMutation.mutate({
                                activityType: 'call_made',
                                description: `Phone call initiated to ${lead.phone}`,
                              });
                            }}
                            data-testid="button-call-lead"
                          >
                            <Phone className="h-4 w-4 mr-2" />
                            Call Lead
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const meetingNote = prompt("Add a note about the meeting scheduled:");
                            if (meetingNote?.trim()) {
                              addActivityMutation.mutate({
                                activityType: 'meeting_scheduled',
                                description: meetingNote,
                              });
                            }
                          }}
                          data-testid="button-schedule-meeting"
                        >
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          Schedule Meeting
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Danger Zone */}
                  <Card className="border-red-200">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2 text-red-700">
                        <AlertCircle className="h-5 w-5" />
                        <span>Danger Zone</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                        <div className="flex items-start space-x-3">
                          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="font-medium text-red-900 mb-2">Delete Lead</h4>
                            <p className="text-sm text-red-700 mb-3">
                              Permanently delete this lead and all associated tasks and activities. This action cannot be undone.
                            </p>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  data-testid="button-delete-lead"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Lead
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Lead</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you absolutely sure you want to delete "{lead.name}"? This will permanently remove:
                                    <ul className="mt-2 ml-4 list-disc text-sm">
                                      <li>The lead record and all its information</li>
                                      <li>All {lead.tasks?.length || 0} associated tasks</li>
                                      <li>All {lead.activities?.length || 0} activity records</li>
                                    </ul>
                                    <strong>This action cannot be undone.</strong>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteLeadMutation.mutate()}
                                    disabled={deleteLeadMutation.isPending}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    {deleteLeadMutation.isPending ? "Deleting..." : "Delete Lead"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}