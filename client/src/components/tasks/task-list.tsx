import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Edit2, 
  Clock, 
  User, 
  AlertTriangle,
  CheckCircle2,
  Circle,
  Pause,
  XCircle,
  Calendar,
  DollarSign,
  MoreHorizontal,
  Save,
  X
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ProjectTaskWithDetails, 
  ProjectTask, 
  InsertProjectTask,
  ProjectCrew,
  ProjectMilestone,
  User
} from "@shared/schema";

interface TaskListProps {
  projectId: number;
  onTaskSelect?: (task: ProjectTask) => void;
  onCreateTask?: (parentTaskId?: number) => void;
  showCreateButton?: boolean;
}

interface TaskListItemProps {
  task: ProjectTaskWithDetails;
  level: number;
  subtasks: ProjectTaskWithDetails[];
  onToggleComplete: (taskId: number, completed: boolean) => void;
  onUpdateTask: (taskId: number, updates: Partial<InsertProjectTask>) => void;
  onCreateSubtask: (parentTaskId: number) => void;
  onTaskSelect?: (task: ProjectTask) => void;
  users: User[];
  crew: ProjectCrew[];
  milestones: ProjectMilestone[];
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending': return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'in_progress': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'completed': return 'bg-green-100 text-green-700 border-green-200';
    case 'blocked': return 'bg-red-100 text-red-700 border-red-200';
    case 'cancelled': return 'bg-gray-100 text-gray-500 border-gray-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'low': return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'medium': return 'bg-blue-100 text-blue-600 border-blue-200';
    case 'high': return 'bg-orange-100 text-orange-600 border-orange-200';
    case 'urgent': return 'bg-red-100 text-red-600 border-red-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending': return <Circle className="h-4 w-4" />;
    case 'in_progress': return <Clock className="h-4 w-4" />;
    case 'completed': return <CheckCircle2 className="h-4 w-4" />;
    case 'blocked': return <AlertTriangle className="h-4 w-4" />;
    case 'cancelled': return <XCircle className="h-4 w-4" />;
    default: return <Circle className="h-4 w-4" />;
  }
};

const TaskListItem = ({ 
  task, 
  level, 
  subtasks, 
  onToggleComplete, 
  onUpdateTask,
  onCreateSubtask,
  onTaskSelect,
  users,
  crew,
  milestones
}: TaskListItemProps) => {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: task.title,
    description: task.description || '',
    status: task.status,
    priority: task.priority,
    assignedTo: task.assignedTo || '',
    completionPercentage: task.completionPercentage || 0,
    estimatedHours: task.estimatedHours || '',
    notes: task.notes || ''
  });

  const hasSubtasks = subtasks.length > 0;
  const indentClass = `ml-${level * 6}`;
  
  const handleSaveEdit = () => {
    onUpdateTask(task.id, {
      title: editData.title,
      description: editData.description,
      status: editData.status as any,
      priority: editData.priority as any,
      assignedTo: editData.assignedTo || null,
      completionPercentage: editData.completionPercentage,
      estimatedHours: editData.estimatedHours || null,
      notes: editData.notes
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditData({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignedTo || '',
      completionPercentage: task.completionPercentage || 0,
      estimatedHours: task.estimatedHours || '',
      notes: task.notes || ''
    });
    setIsEditing(false);
  };

  const assignedUser = users.find(u => u.id === task.assignedTo);
  const assignedCrewMember = crew.find(c => c.userId === task.assignedTo);

  return (
    <div className={cn("space-y-2", level > 0 && indentClass)} data-testid={`task-item-${task.id}`}>
      <div className="flex items-center space-x-3 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
        {/* Expand/Collapse Button */}
        {hasSubtasks && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 w-6 p-0"
            data-testid={`task-expand-${task.id}`}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        )}
        
        {/* Task Checkbox */}
        <Checkbox
          checked={task.status === 'completed'}
          onCheckedChange={(checked) => onToggleComplete(task.id, !!checked)}
          disabled={task.status === 'cancelled' || task.status === 'blocked'}
          data-testid={`task-checkbox-${task.id}`}
        />

        {/* Task Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-3">
              <Input
                value={editData.title}
                onChange={(e) => setEditData({...editData, title: e.target.value})}
                className="font-medium"
                placeholder="Task title"
                data-testid={`task-title-input-${task.id}`}
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Select value={editData.status} onValueChange={(value) => setEditData({...editData, status: value})}>
                  <SelectTrigger data-testid={`task-status-select-${task.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={editData.priority} onValueChange={(value) => setEditData({...editData, priority: value})}>
                  <SelectTrigger data-testid={`task-priority-select-${task.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={editData.assignedTo} onValueChange={(value) => setEditData({...editData, assignedTo: value})}>
                  <SelectTrigger data-testid={`task-assignee-select-${task.id}`}>
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  type="number"
                  placeholder="Estimated hours"
                  value={editData.estimatedHours}
                  onChange={(e) => setEditData({...editData, estimatedHours: e.target.value})}
                  data-testid={`task-hours-input-${task.id}`}
                />
              </div>
              
              <Textarea
                value={editData.description}
                onChange={(e) => setEditData({...editData, description: e.target.value})}
                placeholder="Task description"
                rows={2}
                data-testid={`task-description-input-${task.id}`}
              />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Progress:</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={editData.completionPercentage}
                    onChange={(e) => setEditData({...editData, completionPercentage: parseInt(e.target.value) || 0})}
                    className="w-20"
                    data-testid={`task-progress-input-${task.id}`}
                  />
                  <span className="text-sm text-gray-600">%</span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button size="sm" onClick={handleSaveEdit} data-testid={`task-save-${task.id}`}>
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCancelEdit} data-testid={`task-cancel-${task.id}`}>
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onTaskSelect?.(task)}
                  className="font-medium text-gray-900 hover:text-blue-600 text-left"
                  data-testid={`task-title-${task.id}`}
                >
                  {task.title}
                </button>
                {task.milestone && (
                  <Badge variant="outline" className="text-xs">
                    {task.milestone.name}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <Badge className={cn("text-xs border", getStatusColor(task.status))}>
                  {getStatusIcon(task.status)}
                  <span className="ml-1 capitalize">{task.status.replace('_', ' ')}</span>
                </Badge>
                
                <Badge className={cn("text-xs border", getPriorityColor(task.priority))}>
                  {task.priority.toUpperCase()}
                </Badge>

                {(assignedUser || assignedCrewMember) && (
                  <div className="flex items-center space-x-1">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-xs">
                        {assignedUser ? 
                          `${assignedUser.firstName?.[0]}${assignedUser.lastName?.[0]}` :
                          assignedCrewMember?.externalContractorName?.[0] || 'C'
                        }
                      </AvatarFallback>
                    </Avatar>
                    <span>
                      {assignedUser ? 
                        `${assignedUser.firstName} ${assignedUser.lastName}` :
                        assignedCrewMember?.externalContractorName || 'Crew Member'
                      }
                    </span>
                  </div>
                )}

                {task.estimatedHours && (
                  <div className="flex items-center space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>{task.estimatedHours}h</span>
                  </div>
                )}

                {task.estimatedEndDate && (
                  <div className="flex items-center space-x-1">
                    <Calendar className="h-3 w-3" />
                    <span>{format(new Date(task.estimatedEndDate), 'MMM dd')}</span>
                  </div>
                )}
              </div>

              {task.description && (
                <p className="text-sm text-gray-600 mt-1">{task.description}</p>
              )}

              {task.completionPercentage > 0 && (
                <div className="flex items-center space-x-2">
                  <Progress value={task.completionPercentage} className="flex-1 h-2" />
                  <span className="text-xs text-gray-600 w-10">{task.completionPercentage}%</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {!isEditing && (
          <div className="flex items-center space-x-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsEditing(true)}
              data-testid={`task-edit-${task.id}`}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => onCreateSubtask(task.id)}
              data-testid={`task-add-subtask-${task.id}`}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Subtasks */}
      {hasSubtasks && isExpanded && (
        <div className="space-y-2" data-testid={`task-subtasks-${task.id}`}>
          {subtasks.map((subtask) => (
            <TaskListItem
              key={subtask.id}
              task={subtask}
              level={level + 1}
              subtasks={subtasks.filter(t => t.parentTaskId === subtask.id)}
              onToggleComplete={onToggleComplete}
              onUpdateTask={onUpdateTask}
              onCreateSubtask={onCreateSubtask}
              onTaskSelect={onTaskSelect}
              users={users}
              crew={crew}
              milestones={milestones}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const TaskList = ({ projectId, onTaskSelect, onCreateTask, showCreateButton = true }: TaskListProps) => {
  const { toast } = useToast();

  // Fetch project tasks
  const { data: tasks = [], isLoading } = useQuery<ProjectTaskWithDetails[]>({
    queryKey: ['/api/projects', projectId, 'tasks'],
    enabled: !!projectId,
  });

  // Fetch users for assignments
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  // Fetch crew members for assignments
  const { data: crew = [] } = useQuery<ProjectCrew[]>({
    queryKey: ['/api/projects', projectId, 'crew'],
    enabled: !!projectId,
  });

  // Fetch milestones
  const { data: milestones = [] } = useQuery<ProjectMilestone[]>({
    queryKey: ['/api/projects', projectId, 'milestones'],
    enabled: !!projectId,
  });

  // Task completion mutation
  const completeTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: number, completed: boolean }) => {
      if (completed) {
        return await apiRequest(`/api/tasks/${taskId}/complete`, {
          method: 'POST'
        });
      } else {
        return await apiRequest(`/api/tasks/${taskId}`, {
          method: 'PUT',
          body: { status: 'pending', completionPercentage: 0 }
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      toast({ title: "Task updated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update task", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Task update mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: number, updates: Partial<InsertProjectTask> }) => {
      return await apiRequest(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: updates
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      toast({ title: "Task updated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update task", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Build hierarchical task structure
  const taskHierarchy = useMemo(() => {
    return tasks.filter(task => !task.parentTaskId);
  }, [tasks]);

  const getSubtasks = (parentId: number) => {
    return tasks.filter(task => task.parentTaskId === parentId);
  };

  const handleToggleComplete = (taskId: number, completed: boolean) => {
    completeTaskMutation.mutate({ taskId, completed });
  };

  const handleUpdateTask = (taskId: number, updates: Partial<InsertProjectTask>) => {
    updateTaskMutation.mutate({ taskId, updates });
  };

  const handleCreateSubtask = (parentTaskId: number) => {
    onCreateTask?.(parentTaskId);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-gray-200 rounded-lg"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="task-list">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center">
          Tasks ({tasks.length})
        </CardTitle>
        {showCreateButton && (
          <Button onClick={() => onCreateTask?.()} size="sm" data-testid="button-create-task">
            <Plus className="h-4 w-4 mr-2" />
            New Task
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {taskHierarchy.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-500 mb-4">No tasks created yet</div>
            {showCreateButton && (
              <Button onClick={() => onCreateTask?.()} data-testid="button-create-first-task">
                <Plus className="h-4 w-4 mr-2" />
                Create First Task
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {taskHierarchy.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                level={0}
                subtasks={getSubtasks(task.id)}
                onToggleComplete={handleToggleComplete}
                onUpdateTask={handleUpdateTask}
                onCreateSubtask={handleCreateSubtask}
                onTaskSelect={onTaskSelect}
                users={users}
                crew={crew}
                milestones={milestones}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TaskList;