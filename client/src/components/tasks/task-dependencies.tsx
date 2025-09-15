import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  GitBranch, 
  Plus, 
  Trash, 
  AlertTriangle, 
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  RotateCcw,
  Target,
  Calendar,
  Workflow,
  Eye
} from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ProjectTask,
  ProjectTaskDependency,
  InsertProjectTaskDependency,
  ProjectTaskWithDetails
} from "@shared/schema";

interface TaskDependenciesProps {
  taskId: number;
  projectId: number;
  onDependenciesChange?: (dependencies: ProjectTaskDependency[]) => void;
}

interface DependencyFormData {
  dependsOnTaskId: number | null;
  dependencyType: string;
  lagDays: number;
}

interface DependencyGraphNode {
  id: number;
  title: string;
  status: string;
  dependencies: number[];
  dependents: number[];
  level: number;
  position: { x: number; y: number };
  isOnCriticalPath: boolean;
}

const DEPENDENCY_TYPES = [
  { 
    value: 'finish_to_start', 
    label: 'Finish to Start (FS)', 
    description: 'Task starts when predecessor finishes',
    icon: <ArrowRight className="h-4 w-4" />
  },
  { 
    value: 'start_to_start', 
    label: 'Start to Start (SS)', 
    description: 'Task starts when predecessor starts',
    icon: <ArrowDown className="h-4 w-4" />
  },
  { 
    value: 'finish_to_finish', 
    label: 'Finish to Finish (FF)', 
    description: 'Task finishes when predecessor finishes',
    icon: <ArrowUp className="h-4 w-4" />
  },
  { 
    value: 'start_to_finish', 
    label: 'Start to Finish (SF)', 
    description: 'Task finishes when predecessor starts',
    icon: <RotateCcw className="h-4 w-4" />
  }
];

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

const DependencyCard = ({ 
  dependency, 
  tasks, 
  onDelete,
  type = 'predecessor' 
}: { 
  dependency: ProjectTaskDependency & { dependsOnTask?: ProjectTask, task?: ProjectTask }, 
  tasks: ProjectTask[], 
  onDelete: (dependencyId: number) => void,
  type: 'predecessor' | 'dependent'
}) => {
  const relatedTask = type === 'predecessor' ? dependency.dependsOnTask : dependency.task;
  const dependencyTypeConfig = DEPENDENCY_TYPES.find(dt => dt.value === dependency.dependencyType);
  
  if (!relatedTask) return null;

  const isBlocking = relatedTask.status !== 'completed' && dependency.dependencyType === 'finish_to_start';
  
  return (
    <Card className={cn(
      "border-l-4", 
      isBlocking ? "border-l-red-500 bg-red-50" : "border-l-blue-500"
    )} data-testid={`dependency-card-${dependency.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h4 className="font-medium text-gray-900 text-sm" data-testid={`dependency-task-${dependency.id}`}>
                {relatedTask.title}
              </h4>
              <Badge className={cn("text-xs border", getStatusColor(relatedTask.status))}>
                {relatedTask.status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-gray-600">#{relatedTask.taskNumber || relatedTask.id}</p>
          </div>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                data-testid={`dependency-delete-${dependency.id}`}
              >
                <Trash className="h-3 w-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Dependency</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove this dependency? This may affect the project schedule.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(dependency.id)}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-sm">
            {dependencyTypeConfig?.icon}
            <span className="text-gray-600">{dependencyTypeConfig?.label}</span>
          </div>
          
          {dependency.lagDays > 0 && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Calendar className="h-3 w-3" />
              <span>+{dependency.lagDays} day{dependency.lagDays !== 1 ? 's' : ''} lag</span>
            </div>
          )}

          {isBlocking && (
            <div className="flex items-center space-x-2 text-sm text-red-600">
              <AlertTriangle className="h-3 w-3" />
              <span>Blocking - {relatedTask.title} must be completed first</span>
            </div>
          )}
        </div>

        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500">{dependencyTypeConfig?.description}</p>
        </div>
      </CardContent>
    </Card>
  );
};

const DependencyGraph = ({ 
  tasks, 
  dependencies, 
  currentTaskId,
  onTaskClick 
}: { 
  tasks: ProjectTask[], 
  dependencies: ProjectTaskDependency[],
  currentTaskId: number,
  onTaskClick?: (taskId: number) => void
}) => {
  const graphData = useMemo(() => {
    // Build dependency graph for visualization
    const nodes: DependencyGraphNode[] = [];
    const edges: { from: number; to: number; type: string }[] = [];

    // Create nodes for all tasks
    tasks.forEach((task, index) => {
      const taskDependencies = dependencies.filter(d => d.taskId === task.id);
      const taskDependents = dependencies.filter(d => d.dependsOnTaskId === task.id);
      
      nodes.push({
        id: task.id,
        title: task.title,
        status: task.status,
        dependencies: taskDependencies.map(d => d.dependsOnTaskId),
        dependents: taskDependents.map(d => d.taskId),
        level: 0,
        position: { x: 0, y: index * 80 },
        isOnCriticalPath: false // TODO: Implement critical path calculation
      });
    });

    // Create edges for dependencies
    dependencies.forEach(dep => {
      edges.push({
        from: dep.dependsOnTaskId,
        to: dep.taskId,
        type: dep.dependencyType
      });
    });

    // Calculate levels (rough positioning)
    const calculateLevels = () => {
      const visited = new Set<number>();
      const calculateLevel = (nodeId: number, level: number = 0): number => {
        if (visited.has(nodeId)) return level;
        visited.add(nodeId);
        
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return level;
        
        node.level = Math.max(node.level, level);
        
        // Calculate levels for dependents
        node.dependents.forEach(dependentId => {
          calculateLevel(dependentId, level + 1);
        });
        
        return level;
      };

      // Start with tasks that have no dependencies
      nodes.filter(n => n.dependencies.length === 0).forEach(n => {
        calculateLevel(n.id, 0);
      });

      // Position nodes based on levels
      const levelGroups: { [level: number]: DependencyGraphNode[] } = {};
      nodes.forEach(node => {
        if (!levelGroups[node.level]) {
          levelGroups[node.level] = [];
        }
        levelGroups[node.level].push(node);
      });

      Object.keys(levelGroups).forEach(levelStr => {
        const level = parseInt(levelStr);
        const nodesAtLevel = levelGroups[level];
        nodesAtLevel.forEach((node, index) => {
          node.position = {
            x: level * 200 + 50,
            y: index * 100 + 50
          };
        });
      });
    };

    calculateLevels();

    return { nodes, edges };
  }, [tasks, dependencies]);

  if (graphData.nodes.length === 0) {
    return (
      <div className="text-center py-8">
        <Workflow className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-500">No tasks to display in dependency graph</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-auto" style={{ minHeight: '400px' }}>
      <svg 
        width={Math.max(...graphData.nodes.map(n => n.position.x)) + 200} 
        height={Math.max(...graphData.nodes.map(n => n.position.y)) + 100}
        className="absolute"
      >
        {/* Edges */}
        {graphData.edges.map((edge, index) => {
          const fromNode = graphData.nodes.find(n => n.id === edge.from);
          const toNode = graphData.nodes.find(n => n.id === edge.to);
          if (!fromNode || !toNode) return null;

          const fromX = fromNode.position.x + 80;
          const fromY = fromNode.position.y + 25;
          const toX = toNode.position.x;
          const toY = toNode.position.y + 25;

          return (
            <g key={index}>
              <line
                x1={fromX}
                y1={fromY}
                x2={toX}
                y2={toY}
                stroke="#3b82f6"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
              <text
                x={fromX + (toX - fromX) / 2}
                y={fromY + (toY - fromY) / 2 - 10}
                className="text-xs fill-gray-600"
                textAnchor="middle"
              >
                {edge.type.replace('_', ' ')}
              </text>
            </g>
          );
        })}
        
        {/* Arrow marker */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>
        </defs>
      </svg>

      {/* Nodes */}
      {graphData.nodes.map((node) => (
        <div
          key={node.id}
          className={cn(
            "absolute w-32 h-12 rounded border-2 bg-white shadow-sm cursor-pointer transition-all hover:shadow-md",
            node.id === currentTaskId ? "border-blue-500 bg-blue-50" : "border-gray-200",
            getStatusColor(node.status)
          )}
          style={{
            left: node.position.x,
            top: node.position.y
          }}
          onClick={() => onTaskClick?.(node.id)}
          data-testid={`graph-node-${node.id}`}
        >
          <div className="p-2 h-full flex flex-col justify-center">
            <div className="text-xs font-medium truncate">{node.title}</div>
            <div className="text-xs text-gray-500 capitalize">
              {node.status.replace('_', ' ')}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const TaskDependenciesManager = ({ taskId, projectId, onDependenciesChange }: TaskDependenciesProps) => {
  const [isAddingDependency, setIsAddingDependency] = useState(false);
  const [formData, setFormData] = useState<DependencyFormData>({
    dependsOnTaskId: null,
    dependencyType: 'finish_to_start',
    lagDays: 0
  });
  const [showGraph, setShowGraph] = useState(false);
  const { toast } = useToast();

  // Fetch current task
  const { data: currentTask } = useQuery<ProjectTask>({
    queryKey: ['/api/tasks', taskId],
    enabled: !!taskId,
  });

  // Fetch all project tasks
  const { data: projectTasks = [], isLoading: tasksLoading } = useQuery<ProjectTask[]>({
    queryKey: ['/api/projects', projectId, 'tasks'],
    enabled: !!projectId,
  });

  // Fetch task dependencies (tasks this task depends on)
  const { data: dependencies = [], isLoading: dependenciesLoading } = useQuery<(ProjectTaskDependency & { dependsOnTask: ProjectTask })[]>({
    queryKey: ['/api/tasks', taskId, 'dependencies'],
    enabled: !!taskId,
  });

  // Fetch task dependents (tasks that depend on this task)
  const { data: dependents = [] } = useQuery<(ProjectTaskDependency & { task: ProjectTask })[]>({
    queryKey: ['/api/tasks', taskId, 'dependents'],
    enabled: !!taskId,
  });

  // Fetch all project dependencies for graph
  const { data: allDependencies = [] } = useQuery<ProjectTaskDependency[]>({
    queryKey: ['/api/projects', projectId, 'dependencies'],
    enabled: !!projectId && showGraph,
  });

  // Create dependency mutation
  const createDependencyMutation = useMutation({
    mutationFn: async (dependencyData: InsertProjectTaskDependency) => {
      return await apiRequest(`/api/tasks/${taskId}/dependencies`, {
        method: 'POST',
        body: dependencyData
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'dependents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'dependencies'] });
      setIsAddingDependency(false);
      resetForm();
      toast({ title: "Dependency created successfully" });
      onDependenciesChange?.(dependencies);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create dependency", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Delete dependency mutation
  const deleteDependencyMutation = useMutation({
    mutationFn: async (dependencyId: number) => {
      return await apiRequest(`/api/task-dependencies/${dependencyId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'dependents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'dependencies'] });
      toast({ title: "Dependency removed successfully" });
      onDependenciesChange?.(dependencies);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to remove dependency", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Validation logic
  const availableTasks = useMemo(() => {
    return projectTasks.filter(task => {
      // Can't depend on self
      if (task.id === taskId) return false;
      
      // Can't depend on tasks that already depend on this task (circular dependency prevention)
      const existingDependents = dependents.map(d => d.taskId);
      if (existingDependents.includes(task.id)) return false;
      
      // Can't depend on tasks we already depend on
      const existingDependencies = dependencies.map(d => d.dependsOnTaskId);
      if (existingDependencies.includes(task.id)) return false;
      
      return true;
    });
  }, [projectTasks, taskId, dependencies, dependents]);

  const resetForm = () => {
    setFormData({
      dependsOnTaskId: null,
      dependencyType: 'finish_to_start',
      lagDays: 0
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.dependsOnTaskId) {
      toast({
        title: "Please select a task to depend on",
        variant: "destructive"
      });
      return;
    }

    const dependencyData: InsertProjectTaskDependency = {
      taskId,
      dependsOnTaskId: formData.dependsOnTaskId,
      dependencyType: formData.dependencyType as any,
      lagDays: formData.lagDays
    };

    createDependencyMutation.mutate(dependencyData);
  };

  const handleDelete = (dependencyId: number) => {
    deleteDependencyMutation.mutate(dependencyId);
  };

  if (tasksLoading || dependenciesLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="task-dependencies-manager">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center">
            <GitBranch className="mr-2 h-5 w-5" />
            Task Dependencies
          </CardTitle>
          <div className="flex space-x-2">
            <Button 
              variant="outline"
              onClick={() => setShowGraph(!showGraph)} 
              size="sm"
              data-testid="button-toggle-graph"
            >
              <Eye className="h-4 w-4 mr-2" />
              {showGraph ? 'Hide' : 'Show'} Graph
            </Button>
            <Button 
              onClick={() => setIsAddingDependency(true)} 
              size="sm"
              data-testid="button-add-dependency"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Dependency
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Dependencies (Prerequisites) */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Target className="h-4 w-4 text-gray-500" />
              <h3 className="font-medium">Prerequisites ({dependencies.length})</h3>
              <Badge variant="outline" className="text-xs">Tasks this task depends on</Badge>
            </div>
            
            {dependencies.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
                <GitBranch className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">No prerequisites set</p>
                <p className="text-xs text-gray-400 mb-3">This task can start immediately</p>
                <Button 
                  onClick={() => setIsAddingDependency(true)} 
                  size="sm" 
                  variant="outline"
                  data-testid="button-add-first-dependency"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Dependency
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                {dependencies.map((dependency) => (
                  <DependencyCard
                    key={dependency.id}
                    dependency={dependency}
                    tasks={projectTasks}
                    onDelete={handleDelete}
                    type="predecessor"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Dependents */}
          {dependents.length > 0 && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <ArrowRight className="h-4 w-4 text-gray-500" />
                  <h3 className="font-medium">Dependents ({dependents.length})</h3>
                  <Badge variant="outline" className="text-xs">Tasks that depend on this task</Badge>
                </div>
                
                <div className="grid gap-3">
                  {dependents.map((dependent) => (
                    <DependencyCard
                      key={dependent.id}
                      dependency={dependent}
                      tasks={projectTasks}
                      onDelete={handleDelete}
                      type="dependent"
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Dependency Graph */}
          {showGraph && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Workflow className="h-4 w-4 text-gray-500" />
                  <h3 className="font-medium">Dependency Graph</h3>
                </div>
                
                <Card className="bg-gray-50">
                  <CardContent className="p-4">
                    <ScrollArea className="w-full">
                      <DependencyGraph
                        tasks={projectTasks}
                        dependencies={allDependencies}
                        currentTaskId={taskId}
                        onTaskClick={(clickedTaskId) => {
                          // Could navigate to clicked task or show details
                          console.log('Clicked task:', clickedTaskId);
                        }}
                      />
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Dependency Dialog */}
      <Dialog open={isAddingDependency} onOpenChange={setIsAddingDependency}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task Dependency</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Task Selection */}
            <div className="space-y-2">
              <Label>This task depends on</Label>
              <Select 
                value={formData.dependsOnTaskId?.toString() || ''} 
                onValueChange={(value) => setFormData({...formData, dependsOnTaskId: parseInt(value)})}
              >
                <SelectTrigger data-testid="dependency-task-select">
                  <SelectValue placeholder="Select a task..." />
                </SelectTrigger>
                <SelectContent>
                  {availableTasks.map((task) => (
                    <SelectItem key={task.id} value={task.id.toString()}>
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-xs text-gray-500">
                          #{task.taskNumber || task.id} • {task.status.replace('_', ' ')}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableTasks.length === 0 && (
                <p className="text-sm text-gray-500">No tasks available for dependencies</p>
              )}
            </div>

            {/* Dependency Type */}
            <div className="space-y-2">
              <Label>Dependency Type</Label>
              <Select 
                value={formData.dependencyType} 
                onValueChange={(value) => setFormData({...formData, dependencyType: value})}
              >
                <SelectTrigger data-testid="dependency-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPENDENCY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center space-x-2">
                        {type.icon}
                        <div>
                          <div className="font-medium">{type.label}</div>
                          <div className="text-xs text-gray-500">{type.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lag Days */}
            <div className="space-y-2">
              <Label>Lag Time (days)</Label>
              <Input
                type="number"
                min="0"
                value={formData.lagDays}
                onChange={(e) => setFormData({...formData, lagDays: parseInt(e.target.value) || 0})}
                placeholder="0"
                data-testid="dependency-lag-input"
              />
              <p className="text-xs text-gray-500">
                Additional delay after the predecessor task is completed
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsAddingDependency(false);
                  resetForm();
                }}
                data-testid="dependency-cancel-button"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createDependencyMutation.isPending || !formData.dependsOnTaskId}
                data-testid="dependency-save-button"
              >
                Add Dependency
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskDependenciesManager;