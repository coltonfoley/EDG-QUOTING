import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AccountRole, ContactRole } from "@shared/schema";

interface RoleManagerProps {
  entityType: "account" | "contact";
  entityId: number;
  entityName: string;
  currentRoles: string[];
  onRolesUpdated?: () => void;
}

const AVAILABLE_ROLES = [
  { value: "lead", label: "Lead", color: "bg-blue-500" },
  { value: "client", label: "Client", color: "bg-green-500" },
  { value: "vendor", label: "Vendor", color: "bg-purple-500" },
  { value: "contractor", label: "Contractor", color: "bg-orange-500" },
  { value: "supplier", label: "Supplier", color: "bg-teal-500" },
];

export function RoleManager({ 
  entityType, 
  entityId, 
  entityName, 
  currentRoles, 
  onRolesUpdated 
}: RoleManagerProps) {
  const [selectedRole, setSelectedRole] = useState<string>("");
  const { toast } = useToast();

  const availableRoles = AVAILABLE_ROLES.filter(role => !currentRoles.includes(role.value));

  // Add role mutation
  const addRoleMutation = useMutation({
    mutationFn: async (role: string) => {
      const endpoint = entityType === "account" ? `/api/accounts/${entityId}/roles` : `/api/contacts/${entityId}/roles`;
      return await apiRequest("POST", endpoint, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: entityType === "account" ? ["/api/accounts"] : ["/api/contacts"]
      });
      setSelectedRole("");
      onRolesUpdated?.();
      toast({
        title: "Role added",
        description: `Role has been successfully added to ${entityName}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add role. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Remove role mutation
  const removeRoleMutation = useMutation({
    mutationFn: async (role: string) => {
      const endpoint = entityType === "account" ? `/api/accounts/${entityId}/roles/${role}` : `/api/contacts/${entityId}/roles/${role}`;
      return await apiRequest("DELETE", endpoint, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: entityType === "account" ? ["/api/accounts"] : ["/api/contacts"]
      });
      onRolesUpdated?.();
      toast({
        title: "Role removed",
        description: `Role has been successfully removed from ${entityName}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddRole = () => {
    if (selectedRole) {
      addRoleMutation.mutate(selectedRole);
    }
  };

  const handleRemoveRole = (role: string) => {
    removeRoleMutation.mutate(role);
  };

  const getRoleColor = (role: string) => {
    const roleConfig = AVAILABLE_ROLES.find(r => r.value === role);
    return roleConfig?.color || "bg-gray-500";
  };

  const getRoleLabel = (role: string) => {
    const roleConfig = AVAILABLE_ROLES.find(r => r.value === role);
    return roleConfig?.label || role;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Role Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Roles */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Current Roles</p>
          {currentRoles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {currentRoles.map((role) => (
                <Badge
                  key={role}
                  variant="secondary"
                  className={`${getRoleColor(role)} text-white`}
                  data-testid={`badge-role-${role}`}
                >
                  {getRoleLabel(role)}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2 h-4 w-4 p-0 text-white hover:text-gray-200"
                    onClick={() => handleRemoveRole(role)}
                    disabled={removeRoleMutation.isPending}
                    data-testid={`button-remove-role-${role}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No roles assigned</p>
          )}
        </div>

        {/* Add New Role */}
        {availableRoles.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Add Role</p>
            <div className="flex space-x-2">
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="flex-1" data-testid="select-add-role">
                  <SelectValue placeholder="Select role to add" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${role.color}`} />
                        <span>{role.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddRole}
                disabled={!selectedRole || addRoleMutation.isPending}
                size="sm"
                data-testid="button-add-role"
              >
                {addRoleMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        {availableRoles.length === 0 && currentRoles.length === AVAILABLE_ROLES.length && (
          <p className="text-sm text-gray-500">All available roles have been assigned</p>
        )}
      </CardContent>
    </Card>
  );
}