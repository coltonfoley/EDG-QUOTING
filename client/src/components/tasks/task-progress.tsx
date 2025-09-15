import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  TrendingUp, 
  Clock, 
  Play, 
  Pause, 
  Square, 
  Camera, 
  FileText, 
  Timer, 
  Calendar, 
  Target,
  CheckCircle2,
  AlertTriangle,
  Upload,
  X,
  Save,
  Plus,
  Eye,
  Download,
  RotateCcw
} from "lucide-react";
import { format, formatDistanceToNow, differenceInMinutes, differenceInHours } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ProjectTask,
  ProjectTimeEntry,
  ProjectProgress,
  InsertProjectTimeEntry,
  InsertProjectProgress,
  User,
  ProjectMilestone
} from "@shared/schema";

interface TaskProgressProps {
  taskId: number;
  projectId: number;
  task?: ProjectTask;
  onProgressUpdate?: (progressData: any) => void;
}

interface TimeTracker {
  isRunning: boolean;
  startTime: Date | null;
  elapsedTime: number; // in minutes
  description: string;
}

interface ProgressEntry {
  id?: number;
  percentage: number;
  notes: string;
  photos: File[];
  workCompleted: string;
  issuesEncountered: string;
  nextSteps: string;
  qualityCheck: boolean;
  clientApproval: boolean;
}

const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

const TimeEntryCard = ({ 
  entry, 
  users,
  onEdit,
  onDelete 
}: { 
  entry: ProjectTimeEntry & { user?: User }, 
  users: User[],
  onEdit?: (entry: ProjectTimeEntry) => void,
  onDelete?: (entryId: number) => void
}) => {
  const user = users.find(u => u.id === entry.userId);
  const duration = entry.hoursWorked ? parseFloat(entry.hoursWorked.toString()) : 0;
  const cost = entry.laborCost ? parseFloat(entry.laborCost.toString()) : 0;

  return (
    <Card className="border-l-4 border-l-blue-500" data-testid={`time-entry-${entry.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {user ? `${user.firstName?.[0]}${user.lastName?.[0]}` : 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-sm">
                {user ? `${user.firstName} ${user.lastName}` : 'Unknown User'}
              </p>
              <p className="text-xs text-gray-500">
                {format(new Date(entry.workDate), 'MMM dd, yyyy')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-medium text-sm">{duration}h</p>
            {cost > 0 && (
              <p className="text-xs text-gray-500">${cost.toFixed(2)}</p>
            )}
          </div>
        </div>

        {entry.description && (
          <p className="text-sm text-gray-700 mb-2">{entry.description}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <Clock className="h-3 w-3" />
            <span>{entry.startTime && format(new Date(entry.startTime), 'HH:mm')}</span>
            {entry.endTime && (
              <>
                <span>-</span>
                <span>{format(new Date(entry.endTime), 'HH:mm')}</span>
              </>
            )}
          </div>
          
          <div className="flex space-x-1">
            {onEdit && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => onEdit(entry)}
                data-testid={`time-entry-edit-${entry.id}`}
              >
                <FileText className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => onDelete(entry.id)}
                className="text-red-600 hover:text-red-700"
                data-testid={`time-entry-delete-${entry.id}`}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ProgressEntryCard = ({ 
  entry, 
  onView,
  onEdit,
  onDelete 
}: { 
  entry: ProjectProgress & { user?: User }, 
  onView?: (entry: ProjectProgress) => void,
  onEdit?: (entry: ProjectProgress) => void,
  onDelete?: (entryId: number) => void
}) => {
  const photosCount = entry.progressPhotos ? (Array.isArray(entry.progressPhotos) ? entry.progressPhotos.length : 0) : 0;

  return (
    <Card className="border-l-4 border-l-green-500" data-testid={`progress-entry-${entry.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-lg font-bold text-green-700">
                {entry.completionPercentage}%
              </span>
            </div>
            <div>
              <p className="font-medium text-sm">Progress Update</p>
              <p className="text-xs text-gray-500">
                {format(new Date(entry.reportedAt), 'MMM dd, yyyy HH:mm')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {photosCount > 0 && (
              <Badge variant="outline" className="text-xs">
                <Camera className="h-3 w-3 mr-1" />
                {photosCount}
              </Badge>
            )}
            <Badge className={cn(
              "text-xs",
              entry.qualityCheck ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
            )}>
              {entry.qualityCheck ? "QC Passed" : "Pending QC"}
            </Badge>
          </div>
        </div>

        {entry.workCompleted && (
          <div className="mb-2">
            <p className="text-xs font-medium text-gray-600 mb-1">Work Completed:</p>
            <p className="text-sm text-gray-700">{entry.workCompleted}</p>
          </div>
        )}

        {entry.issuesEncountered && (
          <div className="mb-2">
            <p className="text-xs font-medium text-red-600 mb-1">Issues:</p>
            <p className="text-sm text-gray-700">{entry.issuesEncountered}</p>
          </div>
        )}

        <Progress value={entry.completionPercentage} className="h-2 mb-3" />

        <div className="flex justify-end space-x-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onView?.(entry)}
            data-testid={`progress-entry-view-${entry.id}`}
          >
            <Eye className="h-3 w-3" />
          </Button>
          {onEdit && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => onEdit(entry)}
              data-testid={`progress-entry-edit-${entry.id}`}
            >
              <FileText className="h-3 w-3" />
            </Button>
          )}
          {onDelete && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => onDelete(entry.id)}
              className="text-red-600 hover:text-red-700"
              data-testid={`progress-entry-delete-${entry.id}`}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export const TaskProgressTracker = ({ taskId, projectId, task, onProgressUpdate }: TaskProgressProps) => {
  const [timeTracker, setTimeTracker] = useState<TimeTracker>({
    isRunning: false,
    startTime: null,
    elapsedTime: 0,
    description: ''
  });
  
  const [progressEntry, setProgressEntry] = useState<ProgressEntry>({
    percentage: task?.completionPercentage || 0,
    notes: '',
    photos: [],
    workCompleted: '',
    issuesEncountered: '',
    nextSteps: '',
    qualityCheck: false,
    clientApproval: false
  });
  
  const [isLoggingTime, setIsLoggingTime] = useState(false);
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false);
  const [selectedProgressEntry, setSelectedProgressEntry] = useState<ProjectProgress | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch time entries
  const { data: timeEntries = [], isLoading: timeEntriesLoading } = useQuery<(ProjectTimeEntry & { user?: User })[]>({
    queryKey: ['/api/tasks', taskId, 'time-entries'],
    enabled: !!taskId,
  });

  // Fetch progress entries
  const { data: progressEntries = [], isLoading: progressEntriesLoading } = useQuery<(ProjectProgress & { user?: User })[]>({
    queryKey: ['/api/tasks', taskId, 'progress'],
    enabled: !!taskId,
  });

  // Fetch users for time entry attribution
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  // Fetch milestones
  const { data: milestones = [] } = useQuery<ProjectMilestone[]>({
    queryKey: ['/api/projects', projectId, 'milestones'],
    enabled: !!projectId,
  });

  // Timer effect
  useEffect(() => {
    if (timeTracker.isRunning && timeTracker.startTime) {
      timerRef.current = setInterval(() => {
        const now = new Date();
        const elapsed = differenceInMinutes(now, timeTracker.startTime!);
        setTimeTracker(prev => ({ ...prev, elapsedTime: elapsed }));
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [timeTracker.isRunning, timeTracker.startTime]);

  // Time entry mutations
  const createTimeEntryMutation = useMutation({
    mutationFn: async (timeEntryData: InsertProjectTimeEntry) => {
      return await apiRequest(`/api/tasks/${taskId}/time-entries`, {
        method: 'POST',
        body: timeEntryData
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'time-entries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      setIsLoggingTime(false);
      setTimeTracker({
        isRunning: false,
        startTime: null,
        elapsedTime: 0,
        description: ''
      });
      toast({ title: "Time entry logged successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to log time entry", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Progress entry mutations
  const createProgressEntryMutation = useMutation({
    mutationFn: async (progressData: InsertProjectProgress) => {
      return await apiRequest(`/api/tasks/${taskId}/progress`, {
        method: 'POST',
        body: progressData
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'progress'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      setIsUpdatingProgress(false);
      resetProgressEntry();
      toast({ title: "Progress updated successfully" });
      onProgressUpdate?.(progressEntry);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update progress", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Update task progress mutation
  const updateTaskProgressMutation = useMutation({
    mutationFn: async ({ percentage }: { percentage: number }) => {
      return await apiRequest(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: { 
          completionPercentage: percentage,
          status: percentage === 100 ? 'completed' : 
                  percentage > 0 ? 'in_progress' : 'pending'
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
    }
  });

  const resetProgressEntry = () => {
    setProgressEntry({
      percentage: task?.completionPercentage || 0,
      notes: '',
      photos: [],
      workCompleted: '',
      issuesEncountered: '',
      nextSteps: '',
      qualityCheck: false,
      clientApproval: false
    });
  };

  const handleTimerToggle = () => {
    if (timeTracker.isRunning) {
      // Stop timer
      setTimeTracker(prev => ({ ...prev, isRunning: false }));
    } else {
      // Start timer
      const now = new Date();
      setTimeTracker(prev => ({
        ...prev,
        isRunning: true,
        startTime: now,
        elapsedTime: 0
      }));
    }
  };

  const handleSaveTimeEntry = () => {
    if (!timeTracker.startTime || timeTracker.elapsedTime <= 0) {
      toast({
        title: "Invalid time entry",
        description: "Please start and stop the timer to log time",
        variant: "destructive"
      });
      return;
    }

    const hoursWorked = (timeTracker.elapsedTime / 60).toFixed(2);
    const endTime = new Date(timeTracker.startTime.getTime() + timeTracker.elapsedTime * 60000);

    const timeEntryData: InsertProjectTimeEntry = {
      taskId,
      projectId,
      workDate: new Date(timeTracker.startTime),
      startTime: timeTracker.startTime,
      endTime: endTime,
      hoursWorked: hoursWorked,
      description: timeTracker.description || null
    };

    createTimeEntryMutation.mutate(timeEntryData);
  };

  const handleProgressUpdate = () => {
    const progressData: InsertProjectProgress = {
      projectId,
      taskId,
      completionPercentage: progressEntry.percentage,
      workCompleted: progressEntry.workCompleted || null,
      issuesEncountered: progressEntry.issuesEncountered || null,
      nextSteps: progressEntry.nextSteps || null,
      qualityCheck: progressEntry.qualityCheck,
      clientApprovalRequired: progressEntry.clientApproval,
      notes: progressEntry.notes || null,
      reportedAt: new Date(),
      // TODO: Handle photo uploads to object storage
      progressPhotos: progressEntry.photos.length > 0 ? progressEntry.photos.map(f => f.name) : null
    };

    createProgressEntryMutation.mutate(progressData);
    
    // Also update task completion percentage
    if (progressEntry.percentage !== task?.completionPercentage) {
      updateTaskProgressMutation.mutate({ percentage: progressEntry.percentage });
    }
  };

  const handlePhotoUpload = (files: FileList | null) => {
    if (!files) return;
    
    const newPhotos = Array.from(files).filter(file => 
      file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024 // 5MB limit
    );
    
    if (newPhotos.length !== files.length) {
      toast({
        title: "Some files were skipped",
        description: "Only image files under 5MB are allowed",
        variant: "destructive"
      });
    }
    
    setProgressEntry(prev => ({
      ...prev,
      photos: [...prev.photos, ...newPhotos]
    }));
  };

  const removePhoto = (index: number) => {
    setProgressEntry(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  // Calculate statistics
  const totalTimeLogged = useMemo(() => {
    return timeEntries.reduce((total, entry) => {
      return total + (entry.hoursWorked ? parseFloat(entry.hoursWorked.toString()) : 0);
    }, 0);
  }, [timeEntries]);

  const totalCost = useMemo(() => {
    return timeEntries.reduce((total, entry) => {
      return total + (entry.laborCost ? parseFloat(entry.laborCost.toString()) : 0);
    }, 0);
  }, [timeEntries]);

  const currentProgress = task?.completionPercentage || 0;
  const targetMilestone = milestones.find(m => 
    m.targetDate && new Date(m.targetDate) >= new Date() && 
    m.status !== 'completed'
  );

  if (timeEntriesLoading || progressEntriesLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="task-progress-tracker">
      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <TrendingUp className="mr-2 h-5 w-5" />
            Task Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Completion Progress</Label>
              <Badge className={cn(
                "text-sm",
                currentProgress === 100 ? "bg-green-100 text-green-700" :
                currentProgress >= 75 ? "bg-blue-100 text-blue-700" :
                currentProgress >= 50 ? "bg-yellow-100 text-yellow-700" :
                "bg-gray-100 text-gray-700"
              )}>
                {currentProgress}%
              </Badge>
            </div>
            <Progress value={currentProgress} className="h-4" />
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{totalTimeLogged.toFixed(1)}h</div>
              <div className="text-xs text-blue-600">Time Logged</div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{progressEntries.length}</div>
              <div className="text-xs text-green-600">Progress Updates</div>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">${totalCost.toFixed(0)}</div>
              <div className="text-xs text-purple-600">Labor Cost</div>
            </div>
          </div>

          {/* Next Milestone */}
          {targetMilestone && (
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <Target className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-700">Next Milestone</span>
              </div>
              <p className="text-sm text-orange-600 mt-1">{targetMilestone.name}</p>
              <p className="text-xs text-orange-500">
                Due {format(new Date(targetMilestone.targetDate!), 'MMM dd, yyyy')}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-2">
            <Button 
              onClick={() => setIsLoggingTime(true)} 
              size="sm"
              data-testid="button-log-time"
            >
              <Timer className="h-4 w-4 mr-2" />
              Log Time
            </Button>
            <Button 
              onClick={() => setIsUpdatingProgress(true)} 
              variant="outline" 
              size="sm"
              data-testid="button-update-progress"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Update Progress
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Time Entries */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center">
            <Clock className="mr-2 h-5 w-5" />
            Time Entries ({timeEntries.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {timeEntries.length === 0 ? (
            <div className="text-center py-6">
              <Clock className="mx-auto h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">No time entries yet</p>
              <Button 
                onClick={() => setIsLoggingTime(true)} 
                size="sm" 
                className="mt-2"
                data-testid="button-log-first-time"
              >
                <Timer className="h-4 w-4 mr-2" />
                Log First Time Entry
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {timeEntries.slice(0, 5).map((entry) => (
                <TimeEntryCard
                  key={entry.id}
                  entry={entry}
                  users={users}
                />
              ))}
              {timeEntries.length > 5 && (
                <div className="text-center">
                  <Button variant="outline" size="sm">
                    View All Time Entries ({timeEntries.length})
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress Entries */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center">
            <FileText className="mr-2 h-5 w-5" />
            Progress Updates ({progressEntries.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {progressEntries.length === 0 ? (
            <div className="text-center py-6">
              <FileText className="mx-auto h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">No progress updates yet</p>
              <Button 
                onClick={() => setIsUpdatingProgress(true)} 
                size="sm" 
                className="mt-2"
                data-testid="button-add-first-progress"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add First Progress Update
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {progressEntries.slice(0, 5).map((entry) => (
                <ProgressEntryCard
                  key={entry.id}
                  entry={entry}
                  onView={setSelectedProgressEntry}
                />
              ))}
              {progressEntries.length > 5 && (
                <div className="text-center">
                  <Button variant="outline" size="sm">
                    View All Progress Updates ({progressEntries.length})
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Time Logging Dialog */}
      <Dialog open={isLoggingTime} onOpenChange={setIsLoggingTime}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Time Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Timer */}
            <div className="text-center space-y-4">
              <div className="text-6xl font-mono font-bold text-blue-600">
                {formatDuration(timeTracker.elapsedTime)}
              </div>
              <div className="flex justify-center space-x-2">
                <Button
                  onClick={handleTimerToggle}
                  size="lg"
                  className={cn(
                    timeTracker.isRunning ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
                  )}
                  data-testid="timer-toggle"
                >
                  {timeTracker.isRunning ? (
                    <>
                      <Pause className="h-5 w-5 mr-2" />
                      Stop Timer
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5 mr-2" />
                      Start Timer
                    </>
                  )}
                </Button>
                {timeTracker.elapsedTime > 0 && (
                  <Button
                    onClick={() => setTimeTracker(prev => ({ ...prev, elapsedTime: 0, startTime: null }))}
                    variant="outline"
                    size="lg"
                    data-testid="timer-reset"
                  >
                    <RotateCcw className="h-5 w-5 mr-2" />
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Work Description</Label>
              <Textarea
                value={timeTracker.description}
                onChange={(e) => setTimeTracker(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the work performed..."
                rows={3}
                data-testid="time-description-input"
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsLoggingTime(false);
                  setTimeTracker({
                    isRunning: false,
                    startTime: null,
                    elapsedTime: 0,
                    description: ''
                  });
                }}
                data-testid="time-cancel-button"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveTimeEntry}
                disabled={timeTracker.elapsedTime <= 0 || createTimeEntryMutation.isPending}
                data-testid="time-save-button"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Entry
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Progress Update Dialog */}
      <Dialog open={isUpdatingProgress} onOpenChange={setIsUpdatingProgress}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Task Progress</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Progress Slider */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label>Completion Percentage</Label>
                <span className="text-2xl font-bold text-blue-600">
                  {progressEntry.percentage}%
                </span>
              </div>
              <Slider
                value={[progressEntry.percentage]}
                onValueChange={(values) => setProgressEntry(prev => ({ ...prev, percentage: values[0] }))}
                min={0}
                max={100}
                step={5}
                className="w-full"
                data-testid="progress-slider"
              />
              <Progress value={progressEntry.percentage} className="h-3" />
            </div>

            {/* Work Details */}
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Work Completed</Label>
                <Textarea
                  value={progressEntry.workCompleted}
                  onChange={(e) => setProgressEntry(prev => ({ ...prev, workCompleted: e.target.value }))}
                  placeholder="Describe what work was completed..."
                  rows={3}
                  data-testid="work-completed-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Issues Encountered</Label>
                <Textarea
                  value={progressEntry.issuesEncountered}
                  onChange={(e) => setProgressEntry(prev => ({ ...prev, issuesEncountered: e.target.value }))}
                  placeholder="Any issues, blockers, or challenges..."
                  rows={2}
                  data-testid="issues-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Next Steps</Label>
                <Textarea
                  value={progressEntry.nextSteps}
                  onChange={(e) => setProgressEntry(prev => ({ ...prev, nextSteps: e.target.value }))}
                  placeholder="What needs to be done next..."
                  rows={2}
                  data-testid="next-steps-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Additional Notes</Label>
                <Textarea
                  value={progressEntry.notes}
                  onChange={(e) => setProgressEntry(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any additional notes or observations..."
                  rows={2}
                  data-testid="progress-notes-input"
                />
              </div>
            </div>

            {/* Photos */}
            <div className="space-y-4">
              <Label>Progress Photos</Label>
              
              <div className="flex items-center space-x-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handlePhotoUpload(e.target.files)}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="upload-photos-button"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Add Photos
                </Button>
                <span className="text-sm text-gray-500">
                  {progressEntry.photos.length} file{progressEntry.photos.length !== 1 ? 's' : ''} selected
                </span>
              </div>

              {progressEntry.photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {progressEntry.photos.map((photo, index) => (
                    <div key={index} className="relative">
                      <img
                        src={URL.createObjectURL(photo)}
                        alt={`Progress photo ${index + 1}`}
                        className="w-full h-24 object-cover rounded border"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-1 right-1 h-6 w-6 p-0"
                        onClick={() => removePhoto(index)}
                        data-testid={`remove-photo-${index}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quality and Approval Checks */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={progressEntry.qualityCheck}
                  onChange={(e) => setProgressEntry(prev => ({ ...prev, qualityCheck: e.target.checked }))}
                  className="rounded"
                  data-testid="quality-check-checkbox"
                />
                <Label>Quality check completed</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={progressEntry.clientApproval}
                  onChange={(e) => setProgressEntry(prev => ({ ...prev, clientApproval: e.target.checked }))}
                  className="rounded"
                  data-testid="client-approval-checkbox"
                />
                <Label>Client approval required</Label>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsUpdatingProgress(false);
                  resetProgressEntry();
                }}
                data-testid="progress-cancel-button"
              >
                Cancel
              </Button>
              <Button
                onClick={handleProgressUpdate}
                disabled={createProgressEntryMutation.isPending}
                data-testid="progress-save-button"
              >
                <Save className="h-4 w-4 mr-2" />
                Update Progress
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Progress Entry View Dialog */}
      <Dialog open={!!selectedProgressEntry} onOpenChange={() => setSelectedProgressEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Progress Entry Details</DialogTitle>
          </DialogHeader>
          {selectedProgressEntry && (
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl font-bold text-green-700">
                    {selectedProgressEntry.completionPercentage}%
                  </span>
                </div>
                <div>
                  <p className="font-medium">Progress Update</p>
                  <p className="text-sm text-gray-500">
                    {format(new Date(selectedProgressEntry.reportedAt), 'MMM dd, yyyy HH:mm')}
                  </p>
                </div>
              </div>

              <Progress value={selectedProgressEntry.completionPercentage} className="h-3" />

              {selectedProgressEntry.workCompleted && (
                <div>
                  <p className="font-medium text-sm mb-2">Work Completed:</p>
                  <p className="text-sm text-gray-700">{selectedProgressEntry.workCompleted}</p>
                </div>
              )}

              {selectedProgressEntry.issuesEncountered && (
                <div>
                  <p className="font-medium text-sm mb-2 text-red-600">Issues Encountered:</p>
                  <p className="text-sm text-gray-700">{selectedProgressEntry.issuesEncountered}</p>
                </div>
              )}

              {selectedProgressEntry.nextSteps && (
                <div>
                  <p className="font-medium text-sm mb-2">Next Steps:</p>
                  <p className="text-sm text-gray-700">{selectedProgressEntry.nextSteps}</p>
                </div>
              )}

              {selectedProgressEntry.notes && (
                <div>
                  <p className="font-medium text-sm mb-2">Notes:</p>
                  <p className="text-sm text-gray-700">{selectedProgressEntry.notes}</p>
                </div>
              )}

              <div className="flex items-center space-x-4 pt-2 border-t">
                {selectedProgressEntry.qualityCheck && (
                  <Badge className="bg-green-100 text-green-700">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    QC Passed
                  </Badge>
                )}
                {selectedProgressEntry.clientApprovalRequired && (
                  <Badge className="bg-orange-100 text-orange-700">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Client Approval Required
                  </Badge>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskProgressTracker;