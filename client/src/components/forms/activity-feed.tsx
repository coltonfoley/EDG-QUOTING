import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Phone, Mail, MessageSquare, CheckCircle, AlertCircle, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn, formatCurrency } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertActivitySchema, type Activity, type User } from "@shared/schema";

interface ActivityFeedProps {
  entityType: "account" | "contact" | "opportunity";
  entityId: number;
  entityName: string;
}

const ACTIVITY_TYPES = [
  { value: "call", label: "Call", icon: Phone, color: "bg-blue-500" },
  { value: "email", label: "Email", icon: Mail, color: "bg-green-500" },
  { value: "meeting", label: "Meeting", icon: MessageSquare, color: "bg-purple-500" },
  { value: "task", label: "Task", icon: CheckCircle, color: "bg-orange-500" },
  { value: "note", label: "Note", icon: FileText, color: "bg-gray-500" },
  { value: "quote_sent", label: "Quote Sent", icon: FileText, color: "bg-teal-500" },
  { value: "proposal_sent", label: "Proposal Sent", icon: FileText, color: "bg-indigo-500" },
  { value: "contract_signed", label: "Contract Signed", icon: CheckCircle, color: "bg-emerald-500" },
];

const createActivitySchema = insertActivitySchema.extend({
  dueAt: z.date().optional(),
});

type CreateActivityData = z.infer<typeof createActivitySchema>;

export function ActivityFeed({ entityType, entityId, entityName }: ActivityFeedProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  // Fetch activities
  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities", { entityType, entityId }],
    queryFn: async () => {
      const response = await fetch(`/api/activities?entityType=${entityType}&entityId=${entityId}`);
      if (!response.ok) throw new Error("Failed to fetch activities");
      return response.json();
    },
  });

  // Fetch users for assignment
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  // Create activity form
  const form = useForm<CreateActivityData>({
    resolver: zodResolver(createActivitySchema),
    defaultValues: {
      entityType,
      entityId,
      type: "note",
      summary: "",
      description: "",
      dueAt: undefined,
      assignedTo: "",
    },
  });

  // Create activity mutation
  const createActivityMutation = useMutation({
    mutationFn: async (activityData: CreateActivityData) => {
      return await apiRequest("POST", "/api/activities", activityData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities", { entityType, entityId }] });
      toast({
        title: "Activity created",
        description: "New activity has been successfully created.",
      });
      form.reset();
      setCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create activity. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateActivity = (data: CreateActivityData) => {
    createActivityMutation.mutate(data);
  };

  const getActivityIcon = (type: string) => {
    const activityType = ACTIVITY_TYPES.find(t => t.value === type);
    return activityType?.icon || FileText;
  };

  const getActivityColor = (type: string) => {
    const activityType = ACTIVITY_TYPES.find(t => t.value === type);
    return activityType?.color || "bg-gray-500";
  };

  const getActivityLabel = (type: string) => {
    const activityType = ACTIVITY_TYPES.find(t => t.value === type);
    return activityType?.label || type;
  };

  const formatActivityDate = (date: string) => {
    const activityDate = new Date(date);
    const now = new Date();
    const diffInHours = Math.abs(now.getTime() - activityDate.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return format(activityDate, "h:mm a");
    } else if (diffInHours < 168) { // 7 days
      return format(activityDate, "EEE h:mm a");
    } else {
      return format(activityDate, "MMM d, yyyy");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Activity Feed</CardTitle>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-activity">
              <Plus className="mr-2 h-4 w-4" />
              Add Activity
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Activity</DialogTitle>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreateActivity)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Activity Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-activity-type">
                            <SelectValue placeholder="Select activity type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ACTIVITY_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              <div className="flex items-center space-x-2">
                                <div className={`w-3 h-3 rounded-full ${type.color}`} />
                                <span>{type.label}</span>
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
                  name="summary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Summary *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter activity summary" data-testid="input-activity-summary" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Enter activity description" 
                          rows={3}
                          data-testid="textarea-activity-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dueAt"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Due Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-activity-due-date"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a due date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date("1900-01-01")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-activity-assigned">
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Unassigned</SelectItem>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-4 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setCreateDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createActivityMutation.isPending}
                    className="bg-edg-black hover:bg-edg-grey"
                    data-testid="button-submit"
                  >
                    {createActivityMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Activity
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {activities.length > 0 ? (
          <div className="space-y-4">
            {activities.map((activity, index) => {
              const ActivityIcon = getActivityIcon(activity.type);
              return (
                <div key={activity.id}>
                  <div className="flex items-start space-x-3">
                    <div className={`p-2 rounded-full ${getActivityColor(activity.type)}`}>
                      <ActivityIcon className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">{activity.summary}</p>
                        <div className="flex items-center space-x-2">
                          <Badge variant="secondary" className="text-xs">
                            {getActivityLabel(activity.type)}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {formatActivityDate(activity.createdAt)}
                          </span>
                        </div>
                      </div>
                      {activity.description && (
                        <p className="text-sm text-gray-600 mt-1">{activity.description}</p>
                      )}
                      {activity.dueAt && (
                        <div className="flex items-center mt-2">
                          <AlertCircle className="h-4 w-4 text-orange-500 mr-1" />
                          <span className="text-xs text-orange-600">
                            Due: {format(new Date(activity.dueAt), "PPP")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {index < activities.length - 1 && <Separator className="mt-4" />}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No activities recorded yet</p>
            <p className="text-sm text-gray-400 mt-1">Start tracking interactions with {entityName}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}