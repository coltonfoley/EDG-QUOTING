import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { 
  Clock, 
  User, 
  Calendar, 
  AlertTriangle,
  CheckCircle2,
  Circle,
  Pause,
  XCircle,
  MoreHorizontal,
  Plus,
  Eye,
  Edit,
  Trash,
  ArrowRight,
  Timer
} from "lucide-react";
import { format, formatDistanceToNow, isAfter } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ProjectTaskWithDetails, 
  ProjectTask, 
  InsertProjectTask,
  User,
  ProjectCrew
} from "@shared/schema";

interface TaskBoardProps {
  projectId: number;
  onTaskSelect?: (task: ProjectTask) => void;
  onCreateTask?: () => void;
  onEditTask?: (task: ProjectTask) => void;
  onDeleteTask?: (taskId: number) => void;
}

interface TaskCardProps {
  task: ProjectTaskWithDetails;
  users: User[];
  crew: ProjectCrew[];
  isDragging?: boolean;
}

interface ColumnProps {
  title: string;
  status: string;
  tasks: ProjectTaskWithDetails[];
  users: User[];
  crew: ProjectCrew[];
  onTaskSelect?: (task: ProjectTask) => void;
  onEditTask?: (task: ProjectTask) => void;
  onDeleteTask?: (taskId: number) => void;
  color: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending': return 'border-gray-300 bg-gray-50';
    case 'in_progress': return 'border-blue-300 bg-blue-50';
    case 'completed': return 'border-green-300 bg-green-50';
    case 'blocked': return 'border-red-300 bg-red-50';
    case 'cancelled': return 'border-gray-300 bg-gray-100';
    default: return 'border-gray-300 bg-gray-50';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'low': return 'bg-gray-100 text-gray-600';
    case 'medium': return 'bg-blue-100 text-blue-600';
    case 'high': return 'bg-orange-100 text-orange-600';
    case 'urgent': return 'bg-red-100 text-red-600';
    default: return 'bg-gray-100 text-gray-600';
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

const SortableTaskCard = ({ task, users, crew, isDragging }: TaskCardProps & { isDragging?: boolean }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ 
    id: task.id.toString(),
    data: { type: 'task', task }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging || isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} users={users} crew={crew} isDragging={isSortableDragging || isDragging} />
    </div>
  );
};

const TaskCard = ({ task, users, crew, isDragging }: TaskCardProps) => {
  const assignedUser = users.find(u => u.id === task.assignedTo);
  const assignedCrewMember = crew.find(c => c.userId === task.assignedTo);
  const isOverdue = task.estimatedEndDate && isAfter(new Date(), new Date(task.estimatedEndDate)) && task.status !== 'completed';
  
  return (
    <Card 
      className={cn(
        "mb-3 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md border-l-4",
        getStatusColor(task.status),
        isDragging && "shadow-lg rotate-2",
        isOverdue && "border-l-red-500"
      )}
      data-testid={`task-card-${task.id}`}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              {getStatusIcon(task.status)}
              <h4 className="font-medium text-sm text-gray-900 truncate" data-testid={`task-card-title-${task.id}`}>
                {task.title}
              </h4>
            </div>
            {task.taskNumber && (
              <p className="text-xs text-gray-500">#{task.taskNumber}</p>
            )}
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" data-testid={`task-card-menu-${task.id}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid={`task-card-view-${task.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem data-testid={`task-card-edit-${task.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Task
              </DropdownMenuItem>
              <DropdownMenuItem data-testid={`task-card-time-${task.id}`}>
                <Timer className="mr-2 h-4 w-4" />
                Log Time
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" data-testid={`task-card-delete-${task.id}`}>
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-xs text-gray-600 line-clamp-2">{task.description}</p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          <Badge className={cn("text-xs", getPriorityColor(task.priority))}>
            {task.priority.toUpperCase()}
          </Badge>
          
          {task.milestone && (
            <Badge variant="outline" className="text-xs">
              {task.milestone.name}
            </Badge>
          )}
          
          {isOverdue && (
            <Badge className="text-xs bg-red-100 text-red-600">
              OVERDUE
            </Badge>
          )}

          {task.requiresClientPresence && (
            <Badge variant="outline" className="text-xs">
              Client Required
            </Badge>
          )}
        </div>

        {/* Progress */}
        {task.completionPercentage > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Progress</span>
              <span>{task.completionPercentage}%</span>
            </div>
            <Progress value={task.completionPercentage} className="h-2" />
          </div>
        )}

        {/* Assignment and Time Info */}
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center space-x-2">
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
                <span className="truncate max-w-16">
                  {assignedUser ? 
                    assignedUser.firstName :
                    assignedCrewMember?.externalContractorName || 'Crew'
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
          </div>

          {task.estimatedEndDate && (
            <div className="flex items-center space-x-1">
              <Calendar className="h-3 w-3" />
              <span className={cn(isOverdue && "text-red-600 font-medium")}>
                {format(new Date(task.estimatedEndDate), 'MMM dd')}
              </span>
            </div>
          )}
        </div>

        {/* Dependencies indicator */}
        {task.dependencies && task.dependencies.length > 0 && (
          <div className="flex items-center space-x-1 text-xs text-gray-500">
            <ArrowRight className="h-3 w-3" />
            <span>{task.dependencies.length} dependencies</span>
          </div>
        )}

        {/* Subtasks indicator */}
        {task.subtasks && task.subtasks.length > 0 && (
          <div className="text-xs text-gray-500">
            {task.subtasks.filter(st => st.status === 'completed').length}/{task.subtasks.length} subtasks completed
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const DroppableColumn = ({ title, status, tasks, users, crew, onTaskSelect, onEditTask, onDeleteTask, color }: ColumnProps) => {
  const taskIds = tasks.map(task => task.id.toString());

  return (
    <div className="flex-1 min-w-72">
      <div className={cn("rounded-lg border-2 border-dashed h-full min-h-96", color)}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900 flex items-center">
              {title}
              <Badge variant="secondary" className="ml-2 text-xs">
                {tasks.length}
              </Badge>
            </h3>
          </div>
          
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2" data-testid={`column-${status}`}>
              {tasks.map((task) => (
                <SortableTaskCard
                  key={task.id}
                  task={task}
                  users={users}
                  crew={crew}
                />
              ))}
            </div>
          </SortableContext>

          {tasks.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No {title.toLowerCase()} tasks</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const TaskBoard = ({ projectId, onTaskSelect, onCreateTask, onEditTask, onDeleteTask }: TaskBoardProps) => {
  const [activeTask, setActiveTask] = useState<ProjectTaskWithDetails | null>(null);
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

  // Task status update mutation
  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number, status: string }) => {
      const updateData: Partial<InsertProjectTask> = { status: status as any };
      
      // Auto-set completion percentage based on status
      if (status === 'completed') {
        updateData.completionPercentage = 100;
        updateData.actualEndDate = new Date();
      } else if (status === 'in_progress') {
        updateData.actualStartDate = updateData.actualStartDate || new Date();
        updateData.completionPercentage = updateData.completionPercentage || 10;
      }

      return await apiRequest(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: updateData
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      toast({ title: "Task status updated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update task status", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const grouped = {
      pending: [] as ProjectTaskWithDetails[],
      in_progress: [] as ProjectTaskWithDetails[],
      completed: [] as ProjectTaskWithDetails[],
      blocked: [] as ProjectTaskWithDetails[],
      cancelled: [] as ProjectTaskWithDetails[]
    };

    // Only show top-level tasks (no parent) in the board
    tasks.filter(task => !task.parentTaskId).forEach((task) => {
      if (grouped[task.status as keyof typeof grouped]) {
        grouped[task.status as keyof typeof grouped].push(task);
      }
    });

    return grouped;
  }, [tasks]);

  const columns = [
    { 
      title: 'Pending', 
      status: 'pending', 
      tasks: tasksByStatus.pending, 
      color: 'border-gray-200 bg-gray-50/30' 
    },
    { 
      title: 'In Progress', 
      status: 'in_progress', 
      tasks: tasksByStatus.in_progress, 
      color: 'border-blue-200 bg-blue-50/30' 
    },
    { 
      title: 'Completed', 
      status: 'completed', 
      tasks: tasksByStatus.completed, 
      color: 'border-green-200 bg-green-50/30' 
    },
    { 
      title: 'Blocked', 
      status: 'blocked', 
      tasks: tasksByStatus.blocked, 
      color: 'border-red-200 bg-red-50/30' 
    }
  ];

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find(t => t.id.toString() === active.id);
    setActiveTask(task || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = parseInt(active.id.toString());
    const overId = over.id.toString();
    
    // Determine the new status based on the column
    let newStatus: string;
    if (overId.includes('pending') || over.data.current?.type === 'column' && over.data.current?.status === 'pending') {
      newStatus = 'pending';
    } else if (overId.includes('in_progress') || over.data.current?.type === 'column' && over.data.current?.status === 'in_progress') {
      newStatus = 'in_progress';
    } else if (overId.includes('completed') || over.data.current?.type === 'column' && over.data.current?.status === 'completed') {
      newStatus = 'completed';
    } else if (overId.includes('blocked') || over.data.current?.type === 'column' && over.data.current?.status === 'blocked') {
      newStatus = 'blocked';
    } else {
      // Try to determine from the drop zone or task being dropped on
      const targetTask = tasks.find(t => t.id.toString() === overId);
      if (targetTask) {
        newStatus = targetTask.status;
      } else {
        return; // No valid drop target
      }
    }

    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== newStatus) {
      updateTaskStatusMutation.mutate({ taskId, status: newStatus });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex space-x-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex-1">
                <div className="animate-pulse">
                  <div className="h-8 bg-gray-200 rounded mb-4"></div>
                  <div className="space-y-3">
                    {[1, 2].map((j) => (
                      <div key={j} className="h-24 bg-gray-200 rounded"></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="task-board">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Task Board</CardTitle>
        <Button onClick={onCreateTask} size="sm" data-testid="button-create-task-board">
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </CardHeader>
      <CardContent>
        <DndContext
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          collisionDetection={closestCorners}
        >
          <div className="flex space-x-4 overflow-x-auto pb-4">
            {columns.map((column) => (
              <DroppableColumn
                key={column.status}
                title={column.title}
                status={column.status}
                tasks={column.tasks}
                users={users}
                crew={crew}
                onTaskSelect={onTaskSelect}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
                color={column.color}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? (
              <TaskCard task={activeTask} users={users} crew={crew} isDragging />
            ) : null}
          </DragOverlay>
        </DndContext>

        {tasks.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-4">No tasks created yet</div>
            <Button onClick={onCreateTask} data-testid="button-create-first-task-board">
              <Plus className="h-4 w-4 mr-2" />
              Create First Task
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TaskBoard;