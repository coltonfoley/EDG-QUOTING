import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Trash2, Plus, GripVertical } from "lucide-react";
import { formatCurrency, calculateGroupSubtotal, calculateGroupMargin } from "@/lib/utils";
import type { LineItem } from "@shared/schema";

export interface Group {
  id: string;
  quoteId: number;
  title: string;
  position: number;
  isCollapsed: boolean;
}

interface GroupHeaderProps {
  group: Group;
  lineItems: LineItem[];
  onToggleCollapse: (groupId: string) => void;
  onEditTitle: (groupId: string, title: string) => void;
  onDeleteGroup: (groupId: string) => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}

export function GroupHeader({
  group,
  lineItems,
  onToggleCollapse,
  onEditTitle,
  onDeleteGroup,
  isEditing,
  onStartEdit,
  onCancelEdit
}: GroupHeaderProps) {
  const [editTitle, setEditTitle] = useState(group.title);

  const groupSubtotal = calculateGroupSubtotal(lineItems);
  const groupMargin = calculateGroupMargin(lineItems);
  const itemCount = lineItems.length;

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== group.title) {
      onEditTitle(group.id, editTitle.trim());
    }
    onCancelEdit();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      setEditTitle(group.title);
      onCancelEdit();
    }
  };

  return (
    <div className="bg-gray-50 border-b border-gray-300" data-testid={`group-header-${group.id}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center space-x-3">
          {/* Drag handle */}
          <div className="cursor-grab hover:cursor-grabbing text-gray-400" data-testid={`group-drag-handle-${group.id}`}>
            <GripVertical className="h-4 w-4" />
          </div>
          
          {/* Collapse/expand button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleCollapse(group.id)}
            className="p-0 h-auto"
            data-testid={`button-toggle-group-${group.id}`}
          >
            {group.isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {/* Group title */}
          <div className="flex items-center space-x-2">
            {isEditing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={handleKeyPress}
                className="h-8 text-sm font-medium"
                autoFocus
                data-testid={`input-group-title-${group.id}`}
              />
            ) : (
              <button
                onClick={onStartEdit}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors"
                data-testid={`text-group-title-${group.id}`}
              >
                {group.title}
              </button>
            )}
            <Badge variant="secondary" className="text-xs" data-testid={`badge-item-count-${group.id}`}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </Badge>
          </div>
        </div>

        {/* Group totals and actions */}
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600" data-testid={`text-group-margin-${group.id}`}>
            Margin: {formatCurrency(groupMargin)}
          </div>
          <div className="text-sm font-medium text-gray-900" data-testid={`text-group-subtotal-${group.id}`}>
            Subtotal: {formatCurrency(groupSubtotal)}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDeleteGroup(group.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1"
            data-testid={`button-delete-group-${group.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface GroupFooterProps {
  group: Group;
  lineItems: LineItem[];
  onAddItem: () => void;
}

export function GroupFooter({ group, lineItems, onAddItem }: GroupFooterProps) {
  return (
    <div className="bg-gray-50 border-b border-gray-300 px-4 py-2" data-testid={`group-footer-${group.id}`}>
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={onAddItem}
          className="text-sm"
          data-testid={`button-add-item-to-group-${group.id}`}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Item to Group
        </Button>
        
        <div className="text-sm text-gray-600" data-testid={`text-group-summary-${group.id}`}>
          {lineItems.length} {lineItems.length === 1 ? 'item' : 'items'} • 
          Total: {formatCurrency(calculateGroupSubtotal(lineItems))}
        </div>
      </div>
    </div>
  );
}

interface UngroupedSectionProps {
  lineItems: LineItem[];
  onCreateGroup: () => void;
}

export function UngroupedSection({ lineItems, onCreateGroup }: UngroupedSectionProps) {
  if (lineItems.length === 0) return null;

  const ungroupedSubtotal = calculateGroupSubtotal(lineItems);
  const ungroupedMargin = calculateGroupMargin(lineItems);

  return (
    <div className="bg-gray-50 border-b border-gray-300" data-testid="ungrouped-section">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="text-sm font-medium text-gray-900">
            Ungrouped Items
          </div>
          <Badge variant="secondary" className="text-xs" data-testid="badge-ungrouped-count">
            {lineItems.length} {lineItems.length === 1 ? 'item' : 'items'}
          </Badge>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600" data-testid="text-ungrouped-margin">
            Margin: {formatCurrency(ungroupedMargin)}
          </div>
          <div className="text-sm font-medium text-gray-900" data-testid="text-ungrouped-subtotal">
            Subtotal: {formatCurrency(ungroupedSubtotal)}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateGroup}
            className="text-sm"
            data-testid="button-create-group"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Group
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
  onCreateGroup: (title: string) => void;
}

export function CreateGroupDialog({ open, onClose, onCreateGroup }: CreateGroupDialogProps) {
  const [title, setTitle] = useState("");

  const handleSubmit = () => {
    if (title.trim()) {
      onCreateGroup(title.trim());
      setTitle("");
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-testid="create-group-dialog">
      <div className="bg-white rounded-lg p-6 w-96">
        <h3 className="text-lg font-medium mb-4">Create New Group</h3>
        <Input
          placeholder="Enter group name..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyPress}
          autoFocus
          className="mb-4"
          data-testid="input-group-name"
        />
        <div className="flex justify-end space-x-2">
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="button-cancel-group"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim()}
            data-testid="button-confirm-group"
          >
            Create Group
          </Button>
        </div>
      </div>
    </div>
  );
}