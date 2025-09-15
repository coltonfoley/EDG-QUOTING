import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  UserPlus, 
  Clock, 
  Calendar, 
  DollarSign, 
  AlertTriangle,
  CheckCircle2,
  Edit,
  Trash,
  Eye,
  Plus,
  User,
  Briefcase
} from "lucide-react";
import { format, differenceInHours, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  ProjectTask,
  ProjectTaskAssignment,
  InsertProjectTaskAssignment,
  User as UserType,
  ProjectCrew
} from "@shared/schema";

interface TaskAssignmentProps {
  taskId: number;
  projectId: number;
  onAssignmentChange?: (assignments: ProjectTaskAssignment[]) => void;
}

interface AssignmentFormData {
  crewMemberId?: number;
  userId?: string;
  role: string;
  plannedHours?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  hourlyRate?: string;
  notes?: string;
}

interface WorkloadSummary {
  userId?: string;
  crewMemberId?: number;
  name: string;
  totalPlannedHours: number;
  totalActualHours: number;
  activeAssignments: number;
  utilizationRate: number;
  isOverloaded: boolean;
}

const ASSIGNMENT_ROLES = [
  { value: 'primary', label: 'Primary', description: 'Main responsible person' },
  { value: 'assistant', label: 'Assistant', description: 'Supporting role' },
  { value: 'specialist', label: 'Specialist', description: 'Subject matter expert' },
  { value: 'observer', label: 'Observer', description: 'Monitoring/learning role' }
];

const AssignmentCard = ({ 
  assignment, 
  users, 
  crew, 
  onEdit, 
  onDelete 
}: { 
  assignment: ProjectTaskAssignment, 
  users: UserType[], 
  crew: ProjectCrew[], 
  onEdit: (assignment: ProjectTaskAssignment) => void,
  onDelete: (assignmentId: number) => void 
}) => {
  const assignedUser = users.find(u => u.id === assignment.userId);
  const assignedCrewMember = crew.find(c => c.id === assignment.crewMemberId);
  
  const name = assignedUser 
    ? `${assignedUser.firstName} ${assignedUser.lastName}`
    : assignedCrewMember?.externalContractorName || 'Unknown';
    
  const role = assignedUser?.role || assignedCrewMember?.role || 'crew';

  const plannedHours = assignment.plannedHours ? parseFloat(assignment.plannedHours.toString()) : 0;
  const actualHours = assignment.actualHours ? parseFloat(assignment.actualHours.toString()) : 0;
  const hourlyRate = assignment.hourlyRate ? parseFloat(assignment.hourlyRate.toString()) : 0;

  const progressPercentage = plannedHours > 0 ? Math.min((actualHours / plannedHours) * 100, 100) : 0;
  const isOvertime = actualHours > plannedHours;
  const estimatedCost = plannedHours * hourlyRate;
  const actualCost = actualHours * hourlyRate;

  return (
    <Card className="border-l-4 border-l-blue-500" data-testid={`assignment-card-${assignment.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback>
                {assignedUser ? 
                  `${assignedUser.firstName?.[0]}${assignedUser.lastName?.[0]}` :
                  assignedCrewMember?.externalContractorName?.[0] || 'C'
                }
              </AvatarFallback>
            </Avatar>
            <div>
              <h4 className="font-medium text-gray-900" data-testid={`assignment-name-${assignment.id}`}>
                {name}
              </h4>
              <p className="text-sm text-gray-600">{role}</p>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <Badge className={cn(
              "text-xs",
              assignment.role === 'primary' ? 'bg-blue-100 text-blue-700' :
              assignment.role === 'assistant' ? 'bg-green-100 text-green-700' :
              assignment.role === 'specialist' ? 'bg-purple-100 text-purple-700' :
              'bg-gray-100 text-gray-700'
            )}>
              {assignment.role.toUpperCase()}
            </Badge>
            {!assignment.isActive && (
              <Badge variant="outline" className="text-xs">INACTIVE</Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {/* Time Information */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Planned:</span>
              <span className="font-medium">{plannedHours}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Actual:</span>
              <span className={cn("font-medium", isOvertime && "text-red-600")}>
                {actualHours}h {isOvertime && '⚠️'}
              </span>
            </div>
            {plannedHours > 0 && (
              <div className="space-y-1">
                <Progress value={progressPercentage} className="h-2" />
                <span className="text-xs text-gray-500">{Math.round(progressPercentage)}% complete</span>
              </div>
            )}
          </div>

          {/* Cost Information */}
          {hourlyRate > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Rate:</span>
                <span className="font-medium">${hourlyRate}/hr</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Est. Cost:</span>
                <span className="font-medium">${estimatedCost.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Actual:</span>
                <span className={cn("font-medium", actualCost > estimatedCost && "text-red-600")}>
                  ${actualCost.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Date Information */}
        {(assignment.plannedStartDate || assignment.plannedEndDate) && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between text-sm">
              {assignment.plannedStartDate && (
                <div className="flex items-center space-x-1">
                  <Calendar className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-600">
                    {format(new Date(assignment.plannedStartDate), 'MMM dd')}
                  </span>
                </div>
              )}
              {assignment.plannedEndDate && (
                <div className="flex items-center space-x-1">
                  <Calendar className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-600">
                    to {format(new Date(assignment.plannedEndDate), 'MMM dd')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {assignment.notes && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-sm text-gray-600">{assignment.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onEdit(assignment)}
            data-testid={`assignment-edit-${assignment.id}`}
          >
            <Edit className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-red-600 hover:text-red-700"
                data-testid={`assignment-delete-${assignment.id}`}
              >
                <Trash className="h-3 w-3 mr-1" />
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Assignment</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove {name} from this task? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(assignment.id)}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
};

const WorkloadIndicator = ({ workload }: { workload: WorkloadSummary }) => {
  return (
    <div className={cn(
      "p-3 rounded-lg border",
      workload.isOverloaded ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">{workload.name}</span>
        {workload.isOverloaded && <AlertTriangle className="h-4 w-4 text-red-500" />}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>Utilization</span>
          <span className={cn(
            workload.utilizationRate > 100 && "text-red-600 font-medium"
          )}>
            {Math.round(workload.utilizationRate)}%
          </span>
        </div>
        <Progress 
          value={Math.min(workload.utilizationRate, 100)} 
          className="h-2"
        />
        <div className="flex justify-between text-xs text-gray-600">
          <span>{workload.totalPlannedHours}h planned</span>
          <span>{workload.activeAssignments} tasks</span>
        </div>
      </div>
    </div>
  );
};

export const TaskAssignmentManager = ({ taskId, projectId, onAssignmentChange }: TaskAssignmentProps) => {
  const [isAddingAssignment, setIsAddingAssignment] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<ProjectTaskAssignment | null>(null);
  const [formData, setFormData] = useState<AssignmentFormData>({
    role: 'primary',
    plannedHours: '',
    hourlyRate: '',
    notes: ''
  });
  const { toast } = useToast();

  // Fetch task assignments
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<ProjectTaskAssignment[]>({
    queryKey: ['/api/tasks', taskId, 'assignments'],
    enabled: !!taskId,
  });

  // Fetch users for assignments
  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ['/api/users'],
  });

  // Fetch crew members
  const { data: crew = [] } = useQuery<ProjectCrew[]>({
    queryKey: ['/api/projects', projectId, 'crew'],
    enabled: !!projectId,
  });

  // Fetch all project task assignments for workload calculation
  const { data: allAssignments = [] } = useQuery<ProjectTaskAssignment[]>({
    queryKey: ['/api/projects', projectId, 'all-assignments'],
    enabled: !!projectId,
  });

  // Create assignment mutation
  const createAssignmentMutation = useMutation({
    mutationFn: async (assignmentData: InsertProjectTaskAssignment) => {
      return await apiRequest(`/api/tasks/${taskId}/assignments`, {
        method: 'POST',
        body: assignmentData
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'all-assignments'] });
      setIsAddingAssignment(false);
      resetForm();
      toast({ title: "Assignment created successfully" });
      onAssignmentChange?.(assignments);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create assignment", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Update assignment mutation
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<InsertProjectTaskAssignment> }) => {
      return await apiRequest(`/api/task-assignments/${id}`, {
        method: 'PUT',
        body: data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'all-assignments'] });
      setEditingAssignment(null);
      resetForm();
      toast({ title: "Assignment updated successfully" });
      onAssignmentChange?.(assignments);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update assignment", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      return await apiRequest(`/api/task-assignments/${assignmentId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'all-assignments'] });
      toast({ title: "Assignment removed successfully" });
      onAssignmentChange?.(assignments);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to remove assignment", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Calculate workload summaries
  const workloadSummaries = useMemo(() => {
    const summaries: WorkloadSummary[] = [];

    // Process users
    users.forEach(user => {
      const userAssignments = allAssignments.filter(a => a.userId === user.id && a.isActive);
      const totalPlanned = userAssignments.reduce((sum, a) => sum + (parseFloat(a.plannedHours?.toString() || '0')), 0);
      const totalActual = userAssignments.reduce((sum, a) => sum + (parseFloat(a.actualHours?.toString() || '0')), 0);
      const utilizationRate = totalPlanned > 0 ? (totalPlanned / 40) * 100 : 0; // Assuming 40h work week

      summaries.push({
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        totalPlannedHours: totalPlanned,
        totalActualHours: totalActual,
        activeAssignments: userAssignments.length,
        utilizationRate,
        isOverloaded: utilizationRate > 100
      });
    });

    // Process crew members
    crew.forEach(member => {
      const crewAssignments = allAssignments.filter(a => a.crewMemberId === member.id && a.isActive);
      const totalPlanned = crewAssignments.reduce((sum, a) => sum + (parseFloat(a.plannedHours?.toString() || '0')), 0);
      const totalActual = crewAssignments.reduce((sum, a) => sum + (parseFloat(a.actualHours?.toString() || '0')), 0);
      const utilizationRate = totalPlanned > 0 ? (totalPlanned / 40) * 100 : 0;

      summaries.push({
        crewMemberId: member.id,
        name: member.externalContractorName || `Crew Member ${member.id}`,
        totalPlannedHours: totalPlanned,
        totalActualHours: totalActual,
        activeAssignments: crewAssignments.length,
        utilizationRate,
        isOverloaded: utilizationRate > 100
      });
    });

    return summaries.filter(s => s.activeAssignments > 0 || s.totalPlannedHours > 0);
  }, [users, crew, allAssignments]);

  const resetForm = () => {
    setFormData({
      role: 'primary',
      plannedHours: '',
      hourlyRate: '',
      notes: ''
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const assignmentData: InsertProjectTaskAssignment = {
      taskId,
      role: formData.role as any,
      plannedHours: formData.plannedHours || null,
      hourlyRate: formData.hourlyRate || null,
      plannedStartDate: formData.plannedStartDate ? new Date(formData.plannedStartDate) : null,
      plannedEndDate: formData.plannedEndDate ? new Date(formData.plannedEndDate) : null,
      notes: formData.notes || null,
      isActive: true
    };

    if (formData.userId) {
      assignmentData.userId = formData.userId;
    } else if (formData.crewMemberId) {
      assignmentData.crewMemberId = formData.crewMemberId;
    } else {
      toast({
        title: "Please select a user or crew member",
        variant: "destructive"
      });
      return;
    }

    if (editingAssignment) {
      updateAssignmentMutation.mutate({ id: editingAssignment.id, data: assignmentData });
    } else {
      createAssignmentMutation.mutate(assignmentData);
    }
  };

  const handleEdit = (assignment: ProjectTaskAssignment) => {
    setFormData({
      userId: assignment.userId || '',
      crewMemberId: assignment.crewMemberId || undefined,
      role: assignment.role,
      plannedHours: assignment.plannedHours?.toString() || '',
      plannedStartDate: assignment.plannedStartDate ? format(new Date(assignment.plannedStartDate), 'yyyy-MM-dd') : '',
      plannedEndDate: assignment.plannedEndDate ? format(new Date(assignment.plannedEndDate), 'yyyy-MM-dd') : '',
      hourlyRate: assignment.hourlyRate?.toString() || '',
      notes: assignment.notes || ''
    });
    setEditingAssignment(assignment);
    setIsAddingAssignment(true);
  };

  const handleDelete = (assignmentId: number) => {
    deleteAssignmentMutation.mutate(assignmentId);
  };

  if (assignmentsLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="task-assignment-manager">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center">
            <Users className="mr-2 h-5 w-5" />
            Task Assignments ({assignments.length})
          </CardTitle>
          <Button 
            onClick={() => setIsAddingAssignment(true)} 
            size="sm"
            data-testid="button-add-assignment"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Assignment
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignments.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <div className="text-gray-500 mb-4">No assignments yet</div>
              <Button onClick={() => setIsAddingAssignment(true)} data-testid="button-add-first-assignment">
                <UserPlus className="h-4 w-4 mr-2" />
                Add First Assignment
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {assignments.map((assignment) => (
                <AssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  users={users}
                  crew={crew}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workload Overview */}
      {workloadSummaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Briefcase className="mr-2 h-5 w-5" />
              Team Workload Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workloadSummaries.map((workload, index) => (
                <WorkloadIndicator key={index} workload={workload} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assignment Form Dialog */}
      <Dialog open={isAddingAssignment} onOpenChange={setIsAddingAssignment}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingAssignment ? 'Edit Assignment' : 'Add New Assignment'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Person Selection */}
            <div className="space-y-2">
              <Label>Assign to</Label>
              <div className="space-y-2">
                <Select 
                  value={formData.userId || ''} 
                  onValueChange={(value) => setFormData({...formData, userId: value, crewMemberId: undefined})}
                >
                  <SelectTrigger data-testid="assignment-user-select">
                    <SelectValue placeholder="Select user..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No user selected</SelectItem>
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

                <Select 
                  value={formData.crewMemberId?.toString() || ''} 
                  onValueChange={(value) => setFormData({...formData, crewMemberId: value ? parseInt(value) : undefined, userId: ''})}
                >
                  <SelectTrigger data-testid="assignment-crew-select">
                    <SelectValue placeholder="Or select crew member..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No crew member selected</SelectItem>
                    {crew.map((member) => (
                      <SelectItem key={member.id} value={member.id.toString()}>
                        {member.externalContractorName || `Crew Member ${member.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData({...formData, role: value})}>
                <SelectTrigger data-testid="assignment-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      <div>
                        <div className="font-medium">{role.label}</div>
                        <div className="text-xs text-gray-500">{role.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time and Cost */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Planned Hours</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={formData.plannedHours}
                  onChange={(e) => setFormData({...formData, plannedHours: e.target.value})}
                  placeholder="8"
                  data-testid="assignment-hours-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Hourly Rate ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({...formData, hourlyRate: e.target.value})}
                  placeholder="25.00"
                  data-testid="assignment-rate-input"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Planned Start</Label>
                <Input
                  type="date"
                  value={formData.plannedStartDate}
                  onChange={(e) => setFormData({...formData, plannedStartDate: e.target.value})}
                  data-testid="assignment-start-date-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Planned End</Label>
                <Input
                  type="date"
                  value={formData.plannedEndDate}
                  onChange={(e) => setFormData({...formData, plannedEndDate: e.target.value})}
                  data-testid="assignment-end-date-input"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Additional notes about this assignment..."
                rows={3}
                data-testid="assignment-notes-input"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsAddingAssignment(false);
                  setEditingAssignment(null);
                  resetForm();
                }}
                data-testid="assignment-cancel-button"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createAssignmentMutation.isPending || updateAssignmentMutation.isPending}
                data-testid="assignment-save-button"
              >
                {editingAssignment ? 'Update' : 'Add'} Assignment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskAssignmentManager;