import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { ChevronDown, ChevronRight, Trash2, Plus, GripVertical } from "lucide-react";
import { formatCurrency, calculateGroupSubtotal, calculateGroupMargin } from "@/lib/utils";
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  isDropTarget?: boolean;
}

export function GroupHeader({
  group,
  lineItems,
  onToggleCollapse,
  onEditTitle,
  onDeleteGroup,
  isEditing,
  onStartEdit,
  onCancelEdit,
  isDropTarget = false
}: GroupHeaderProps) {
  const [editTitle, setEditTitle] = useState(group.title);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `group-${group.id}`
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

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
    <tr ref={setNodeRef} style={style} className={`border-b border-border transition-all duration-200 ${isDropTarget ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset dark:bg-blue-950/40' : 'bg-muted/50'}`} data-testid={`group-header-${group.id}`}>
      <td colSpan={9} className="px-4 py-3">
        <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Drag handle */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${group.title}`}
            className="cursor-grab hover:cursor-grabbing text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`group-drag-handle-${group.id}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          
          {/* Collapse/expand button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onToggleCollapse(group.id)}
            className="p-0 h-auto"
            aria-label={`${group.isCollapsed ? "Expand" : "Collapse"} ${group.title}`}
            aria-expanded={!group.isCollapsed}
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
                type="button"
                onClick={onStartEdit}
                className="text-sm font-medium text-foreground transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Rename group ${group.title}`}
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
          <div className="text-sm text-muted-foreground" data-testid={`text-group-margin-${group.id}`}>
            Margin: {formatCurrency(groupMargin)}
          </div>
          <div className="text-sm font-medium text-foreground" data-testid={`text-group-subtotal-${group.id}`}>
            Subtotal: {formatCurrency(groupSubtotal)}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1"
                aria-label={`Delete group ${group.title}`}
                data-testid={`button-delete-group-${group.id}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {group.title}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The group will be removed. Its {itemCount} {itemCount === 1 ? "item" : "items"} will be preserved as ungrouped quote items.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDeleteGroup(group.id)}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid={`button-confirm-delete-group-${group.id}`}
                >
                  Delete Group
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        </div>
      </td>
    </tr>
  );
}

interface GroupFooterProps {
  group: Group;
  lineItems: LineItem[];
  onAddItem: () => void;
}

export function GroupFooter({ group, lineItems, onAddItem }: GroupFooterProps) {
  return (
    <tr className="bg-gray-50 border-b border-gray-300" data-testid={`group-footer-${group.id}`}>
      <td colSpan={9} className="px-4 py-2">
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
      </td>
    </tr>
  );
}

interface UngroupedSectionProps {
  lineItems: LineItem[];
  onCreateGroup: () => void;
  isDropTarget?: boolean;
}

export function UngroupedSection({ lineItems, onCreateGroup, isDropTarget = false }: UngroupedSectionProps) {
  const { setNodeRef } = useDroppable({
    id: "ungrouped"
  });

  const ungroupedSubtotal = calculateGroupSubtotal(lineItems);
  const ungroupedMargin = calculateGroupMargin(lineItems);

  return (
    <tr ref={setNodeRef} className={`border-b border-gray-300 transition-all duration-200 ${isDropTarget ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset' : 'bg-gray-50'}`} data-testid="ungrouped-section">
      <td colSpan={9} className="px-4 py-3">
        <div className="flex items-center justify-between">
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
      </td>
    </tr>
  );
}

interface UngroupedDropZoneProps {
  isDropTarget: boolean;
}

export function UngroupedDropZone({ isDropTarget }: UngroupedDropZoneProps) {
  const { setNodeRef } = useDroppable({
    id: "ungrouped-dropzone"
  });

  return (
    <tr 
      ref={setNodeRef} 
      className={`border-b border-gray-300 transition-all duration-200 ${isDropTarget ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset' : 'bg-gray-100 hover:bg-gray-200'}`} 
      data-testid="ungrouped-drop-zone"
    >
      <td colSpan={11} className="px-4 py-3">
        <div className="flex items-center justify-center text-sm text-gray-600">
          {isDropTarget ? (
            <span className="font-medium text-blue-700">Drop here to move to Ungrouped Items</span>
          ) : (
            <span>Drag items here to remove from groups</span>
          )}
        </div>
      </td>
    </tr>
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
