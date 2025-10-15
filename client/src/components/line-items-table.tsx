import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef, memo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, Package, Search, Filter, X, FileText, Loader2, GripVertical, Settings } from "lucide-react";
import { useLocation } from "wouter";
import { formatCurrency, calculateLineItemTotal, calculateLineItemMargin, applyDiscountToPrice, isValidNumber, clampValue, roundCurrency, generateGroupId, sanitizeNumberString } from "@/lib/utils";
import { apiRequest, NavigationAbortError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LineItem, Product } from "@shared/schema";
import { 
  DndContext, 
  DragEndEvent, 
  DragOverEvent, 
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  GroupHeader, 
  GroupFooter, 
  UngroupedSection, 
  CreateGroupDialog,
  type Group 
} from './group-components';

interface LineItemsTableProps {
  quoteId: number;
  lineItems: LineItem[];
}

export function LineItemsTable({ quoteId, lineItems }: LineItemsTableProps) {
  // Check if quote is new (not saved yet)
  const isUnsavedQuote = !quoteId || quoteId === 0;
  const [, setLocation] = useLocation();
  
  const [newItem, setNewItem] = useState({
    description: "",
    quantity: "1",
    retailPrice: "",
    unitPrice: "0",
    discountType: "percentage" as "percentage" | "dollar",
    discountValue: "0",
    markupType: "percentage" as "percentage" | "dollar",
    markupValue: "0",
  });
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>("all");
  const [showDimensionDialog, setShowDimensionDialog] = useState(false);
  const [selectedConfigurableProduct, setSelectedConfigurableProduct] = useState<Product | null>(null);
  const [dimensions, setDimensions] = useState({ length: "", width: "" });
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [isCleaningDescriptions, setIsCleaningDescriptions] = useState(false);
  
  // Group management state
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Debounced save timeout refs
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  
  // AbortController for cancelling requests on unmount
  const abortController = useRef<AbortController>(new AbortController());
  
  // Refs for tracking pending mutations to cancel them on unmount
  const pendingMutations = useRef<{
    create: any;
    update: Record<string, any>;
    delete: any;
    calculate: any;
  }>({
    create: null,
    update: {},
    delete: null,
    calculate: null,
  });
  
  // Local state for immediate edit feedback
  const [localValues, setLocalValues] = useState<Record<string, { 
    description: string; 
    quantity: string; 
    unitPrice: string; 
    markupType: string; 
    markupValue: string; 
  }>>({});
  
  // Track which fields are actively being edited (have focus)
  const activeInputs = useRef<Set<string>>(new Set());
  
  // Focus restoration refs to prevent focus loss during re-renders
  const activeKeyRef = useRef<string | null>(null);
  const caretRef = useRef<number | null>(null);
  
  // Validation error states
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [newItemErrors, setNewItemErrors] = useState<Record<string, string>>({});

  // Cleanup debounce timers and cancel pending mutations on unmount
  useEffect(() => {
    return () => {
      // Clear debounce timers
      Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer));
      
      // Abort all pending API requests
      abortController.current.abort();
      
      // Cancel all pending mutations using React Query's built-in cancellation
      try {
        if (pendingMutations.current.create) {
          pendingMutations.current.create.abort?.();
        }
        if (pendingMutations.current.delete) {
          pendingMutations.current.delete.abort?.();
        }
        if (pendingMutations.current.calculate) {
          pendingMutations.current.calculate.abort?.();
        }
        Object.values(pendingMutations.current.update).forEach(mutation => {
          if (mutation?.abort) {
            mutation.abort();
          }
        });
      } catch (error) {
        // Silently handle any abort errors during cleanup
      }
    };
  }, []);

  // Initialize local values when lineItems change
  useEffect(() => {
    // Don't reset if there are pending saves or active inputs
    if (Object.keys(debounceTimers.current).length > 0 || activeInputs.current.size > 0) {
      return;
    }
    
    const newLocalValues: Record<string, { 
      description: string; 
      quantity: string; 
      unitPrice: string; 
      markupType: string; 
      markupValue: string; 
    }> = {};
    lineItems.forEach(item => {
      newLocalValues[item.id] = {
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        markupType: item.markupType,
        markupValue: item.markupValue.toString()
      };
    });
    setLocalValues(newLocalValues);
  }, [lineItems]);

  // Create a Map for O(1) line item lookups instead of O(n) array.find()
  const itemById = useMemo(() => 
    new Map(lineItems.map(i => [i.id, i])), 
    [lineItems]
  );

  // Helper function to get current value (local or from props)
  const getCurrentValue = (itemId: number, field: 'description' | 'quantity' | 'unitPrice' | 'markupType' | 'markupValue') => {
    const item = itemById.get(itemId);
    return localValues[itemId]?.[field] ?? 
      (field === 'description' ? item?.description || '' :
       field === 'quantity' ? item?.quantity.toString() || '0' :
       field === 'unitPrice' ? item?.unitPrice.toString() || '0' :
       field === 'markupType' ? item?.markupType || 'percentage' :
       item?.markupValue.toString() || '0');
  };

  // Mark a field as active and capture caret position
  const markActive = useCallback((key: string, el: HTMLInputElement | null) => {
    if (!el) return;
    activeInputs.current.add(key);
    activeKeyRef.current = key;
    // Capture caret position
    try {
      caretRef.current = el.selectionStart ?? null;
    } catch {
      caretRef.current = null;
    }
  }, []);

  // Restore focus and caret position after re-renders
  useLayoutEffect(() => {
    if (!activeKeyRef.current) return;
    const key = activeKeyRef.current;
    
    // Parse the key to get id and field: `${item.id}-${field}`
    const [id, field] = key.split("-");
    const testId =
      field === "unitPrice" ? `input-unit-price-${id}` :
      field === "markupValue" ? `input-markup-value-${id}` :
      field === "quantity" ? `input-quantity-${id}` :
      field === "description" ? `input-description-${id}` :
      null;

    if (!testId) return;
    const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement | null;
    if (el && document.activeElement !== el) {
      el.focus();
      if (caretRef.current != null) {
        try {
          el.setSelectionRange(caretRef.current, caretRef.current);
        } catch {
          // If setSelectionRange fails, just move to end
          el.setSelectionRange(el.value.length, el.value.length);
        }
      } else {
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Fetch groups for this quote
  const { data: groups = [], isLoading: groupsLoading, error: groupsError } = useQuery<Group[]>({
    queryKey: ["/api/quotes", quoteId, "groups"],
    queryFn: async ({ signal }) => {
      const response = await apiRequest('GET', `/api/quotes/${quoteId}/groups`, undefined, { signal });
      return response.json();
    },
    enabled: !isUnsavedQuote,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Helper function to get product by ID
  const getProductById = (productId: number | null) => {
    if (!productId || !products) return null;
    return products.find(p => p.id === productId) || null;
  };

  // Immediate local update with debounced server save
  const handleFieldChange = useCallback((itemId: number, field: string, value: any) => {
    const key = `${itemId}-${field}`;
    
    // Update local state immediately for instant feedback
    setLocalValues(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? {}),
        [field]: value
      }
    }));
    
    // Clear existing timer for this field
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }
    
    // Validate the value
    let validationError = "";
    if (field === "description") {
      if (!value || value.trim().length === 0) {
        validationError = "Description is required";
      } else if (value.trim().length < 2) {
        validationError = "Description must be at least 2 characters";
      } else if (value.length > 500) {
        validationError = "Description must be less than 500 characters";
      }
    } else if (field === "quantity") {
      const num = parseFloat(sanitizeNumberString(value));
      if (!value || isNaN(num) || num <= 0) {
        validationError = "Quantity must be greater than 0";
      } else if (num > 999999) {
        validationError = "Quantity must be less than 999,999";
      }
    } else if (field === "unitPrice") {
      const num = parseFloat(sanitizeNumberString(value));
      if (!value && value !== "0") {
        validationError = "Unit price is required";
      } else if (isNaN(num) || num < 0) {
        validationError = "Unit price must be a valid positive number";
      } else if (num > 10000000) {
        validationError = "Unit price must be less than $10,000,000";
      }
    } else if (field === "markupValue") {
      const num = parseFloat(sanitizeNumberString(value));
      if (!value && value !== "0") {
        validationError = "Markup value is required";
      } else if (isNaN(num)) {
        validationError = "Markup must be a valid number";
      } else if (num < -10000000 || num > 10000000) {
        validationError = "Markup must be between -10,000,000 and 10,000,000";
      }
    } else if (field === "markupType") {
      if (!value || (value !== "percentage" && value !== "dollar")) {
        validationError = "Markup type must be percentage or dollar";
      }
    }
    
    // Update validation errors
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      if (validationError) {
        newErrors[key] = validationError;
      } else {
        delete newErrors[key];
      }
      return newErrors;
    });
    
    // Don't set up debounced save - we'll save on blur instead
    // This prevents the save from firing while the user is still typing
  }, []);
  
  // Save field on blur (when user moves away from the field)
  const handleFieldBlur = useCallback((itemId: number, field: 'description' | 'quantity' | 'unitPrice' | 'markupType' | 'markupValue') => {
    const key = `${itemId}-${field}`;
    const value = localValues[itemId]?.[field];
    
    // Remove from active inputs
    activeInputs.current.delete(key);
    
    // Clear any pending timer
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
      delete debounceTimers.current[key];
    }
    
    // Check if there's a validation error
    if (validationErrors[key]) {
      return; // Don't save if there's a validation error
    }
    
    // Save immediately on blur
    try {
      let updateData;
      if (field === "quantity" || field === "unitPrice" || field === "markupValue") {
        const sanitized = sanitizeNumberString(value);
        const parsed = parseFloat(sanitized);
        
        // If the value is invalid or empty, revert to previous value instead of zero
        if (sanitized === '' || isNaN(parsed)) {
          const item = lineItems.find(item => item.id === itemId);
          if (item) {
            const previousValue = item[field];
            // Revert local state to previous value
            setLocalValues(prev => ({
              ...prev,
              [itemId]: {
                ...prev[itemId],
                [field]: previousValue.toString()
              }
            }));
          }
          return; // Don't save invalid input
        }
        
        updateData = { [field]: parsed };
      } else {
        updateData = { [field]: value };
      }
      updateLineItemMutation.mutate({ id: itemId, data: updateData });
    } catch (error) {
      const err = error as Error;
      if (err?.name !== 'AbortError' && !err?.message?.includes('aborted') && !err?.message?.includes('signal is aborted')) {
        console.error('Error saving on blur:', error);
      }
    }
  }, [localValues, validationErrors, lineItems]);
  
  // Keyboard navigation helper
  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, column: 'description' | 'quantity' | 'unitPrice' | 'markupValue') => {
    const totalRows = lineItems.length;
    
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        // Move up a row
        if (rowIndex > 0) {
          const columnTestId = column === 'unitPrice' ? 'unit-price' : 
                              column === 'markupValue' ? 'markup-value' : column;
          const selector = `[data-testid="input-${columnTestId}-${lineItems[rowIndex - 1].id}"]`;
          const element = document.querySelector(selector) as HTMLInputElement;
          if (element) {
            element.focus();
            element.select();
          }
        }
      } else {
        // Move down a row
        if (rowIndex < totalRows - 1) {
          const columnTestId = column === 'unitPrice' ? 'unit-price' : 
                              column === 'markupValue' ? 'markup-value' : column;
          const selector = `[data-testid="input-${columnTestId}-${lineItems[rowIndex + 1].id}"]`;
          const element = document.querySelector(selector) as HTMLInputElement;
          if (element) {
            element.focus();
            element.select();
          }
        }
      }
    } else if (e.key === 'Tab') {
      // Allow default Tab behavior for horizontal navigation
      return;
    }
  }, [lineItems]);

  const createLineItemMutation = useMutation({
    mutationFn: async (data: any) => {
      try {
        const response = await apiRequest("POST", `/api/quotes/${quoteId}/line-items`, data, {
          signal: abortController.current.signal
        });
        return response.json();
      } catch (error: any) {
        // If this is an abort error, don't let it become an unhandled rejection
        if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
          // Return a special marker that onSuccess can ignore
          return { __aborted: true };
        }
        // Re-throw other errors so onError can handle them
        throw error;
      }
    },
    onSuccess: (result: any) => {
      // Check if this was an aborted mutation
      if (result?.__aborted) {
        return;
      }
      
      // Clear the pending mutation reference
      pendingMutations.current.create = null;
      
      // Invalidate the specific quote to refetch it
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      
      // Also update the list cache by refetching and updating that specific quote
      queryClient.fetchQuery({ queryKey: [`/api/quotes/${quoteId}`] }).then((updatedQuote) => {
        queryClient.setQueryData(["/api/quotes"], (old: any) => {
          if (!old) return old;
          return old.map((q: any) => q.id === quoteId ? updatedQuote : q);
        });
      });
      
      setNewItem({
        description: "",
        quantity: "1",
        retailPrice: "",
        unitPrice: "0",
        discountType: "percentage",
        discountValue: "0",
        markupType: "percentage",
        markupValue: "0",
      });
      setShowNewItemForm(false);
      toast({ title: "Line item added successfully" });
    },
    onError: (error: any) => {
      // Clear the pending mutation reference
      pendingMutations.current.create = null;
      
      // Check if the error is due to abort and handle gracefully
      if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to add line item", variant: "destructive" });
    },
  });

  const updateLineItemMutation = useMutation({
    mutationFn: async ({ id, data, skipInvalidation }: { id: number; data: any; skipInvalidation?: boolean }) => {
      try {
        const response = await apiRequest("PUT", `/api/line-items/${id}`, data, {
          signal: abortController.current.signal
        });
        return { ...response.json(), skipInvalidation };
      } catch (error: any) {
        // If this is an abort error, don't let it become an unhandled rejection
        if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
          // Return a special marker that onSuccess can ignore
          return { __aborted: true };
        }
        // Re-throw other errors so onError can handle them
        throw error;
      }
    },
    onSuccess: (result, { id }) => {
      // Check if this was an aborted mutation
      if (result?.__aborted) {
        return;
      }
      
      // Clear the pending mutation reference
      const updateKey = `update-${id}`;
      delete pendingMutations.current.update[updateKey];
      
      // Invalidate queries by default to update totals, unless explicitly skipped
      // Skip invalidation for batch operations (will be invalidated once at the end)
      if (result.skipInvalidation !== true) {
        queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
        
        // Also update the list cache by refetching and updating that specific quote
        queryClient.fetchQuery({ queryKey: [`/api/quotes/${quoteId}`] }).then((updatedQuote) => {
          queryClient.setQueryData(["/api/quotes"], (old: any) => {
            if (!old) return old;
            return old.map((q: any) => q.id === quoteId ? updatedQuote : q);
          });
        });
      }
      
      // Clear validation errors for this item on successful save
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        Object.keys(newErrors).forEach(key => {
          if (key.startsWith(`${id}-`)) {
            delete newErrors[key];
          }
        });
        return newErrors;
      });
    },
    onError: (error: any, variables) => {
      // Clear the pending mutation reference
      const updateKey = `update-${variables.id}`;
      delete pendingMutations.current.update[updateKey];
      
      // Check if the error is due to abort and handle gracefully
      if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to update line item", variant: "destructive" });
    },
  });

  // Group mutations
  const createGroupMutation = useMutation({
    mutationFn: async (data: { id: string; title: string; quoteId: number; position?: number }) => {
      try {
        const response = await apiRequest("POST", `/api/quotes/${quoteId}/groups`, data, {
          signal: abortController.current.signal
        });
        return response.json();
      } catch (error: any) {
        // If this is an abort error, don't let it become an unhandled rejection
        if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
          // Return a special marker that onSuccess can ignore
          return { __aborted: true };
        }
        // Re-throw other errors so onError can handle them
        throw error;
      }
    },
    onSuccess: (result: any) => {
      // Check if this was an aborted mutation
      if (result?.__aborted) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId, "groups"] });
      toast({ title: "Group created successfully" });
    },
    onError: (error: any) => {
      // Check if the error is due to abort and handle gracefully
      if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to create group", variant: "destructive" });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ groupId, data }: { groupId: string; data: Partial<Group> }) => {
      try {
        const response = await apiRequest("PUT", `/api/groups/${groupId}`, data, {
          signal: abortController.current.signal
        });
        return response.json();
      } catch (error: any) {
        // If this is an abort error, don't let it become an unhandled rejection
        if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
          // Return a special marker that onSuccess can ignore
          return { __aborted: true };
        }
        // Re-throw other errors so onError can handle them
        throw error;
      }
    },
    onSuccess: (result: any) => {
      // Check if this was an aborted mutation
      if (result?.__aborted) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId, "groups"] });
    },
    onError: (error: any) => {
      // Check if the error is due to abort and handle gracefully
      if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to update group", variant: "destructive" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      try {
        await apiRequest("DELETE", `/api/groups/${groupId}`, undefined, {
          signal: abortController.current.signal
        });
        return groupId;
      } catch (error: any) {
        // If this is an abort error, don't let it become an unhandled rejection
        if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
          // Return a special marker that onSuccess can ignore
          return { __aborted: true };
        }
        // Re-throw other errors so onError can handle them
        throw error;
      }
    },
    onSuccess: (result: any) => {
      // Check if this was an aborted mutation
      if (result?.__aborted) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId, "groups"] });
      toast({ title: "Group deleted successfully" });
    },
    onError: (error: any) => {
      // Check if the error is due to abort and handle gracefully
      if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to delete group", variant: "destructive" });
    },
  });

  const reorderLineItemsMutation = useMutation({
    mutationFn: async (moves: { id: number; groupId: string | null; position: number }[]) => {
      try {
        const response = await apiRequest("PATCH", "/api/line-items/reorder", {
          moves,
          quoteId
        }, {
          signal: abortController.current.signal
        });
        return response.json();
      } catch (error: any) {
        // If this is an abort error, don't let it become an unhandled rejection
        if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
          // Return a special marker that onSuccess can ignore
          return { __aborted: true };
        }
        // Re-throw other errors so onError can handle them
        throw error;
      }
    },
    onSuccess: (result: any) => {
      // Check if this was an aborted mutation
      if (result?.__aborted) {
        return;
      }
      // Only invalidate the specific quote and its groups to avoid cancel storms
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId, "groups"] });
    },
    onError: (error: any) => {
      // Check if the error is due to abort and handle gracefully
      if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to reorder items", variant: "destructive" });
    },
  });

  const reorderGroupsMutation = useMutation({
    mutationFn: async (groupPositions: { id: string; position: number }[]) => {
      const response = await apiRequest("PATCH", "/api/groups/reorder", {
        quoteId,
        groupPositions
      }, {
        signal: abortController.current.signal
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId, "groups"] });
    },
    onError: (error: any) => {
      // Check if the error is due to abort and handle gracefully
      if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to reorder groups", variant: "destructive" });
    },
  });

  const deleteLineItemMutation = useMutation({
    mutationFn: async (id: number) => {
      try {
        await apiRequest("DELETE", `/api/line-items/${id}`, undefined, {
          signal: abortController.current.signal
        });
      } catch (error: any) {
        // If this is an abort error, don't let it become an unhandled rejection
        if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
          // Return null to signal abort
          return null;
        }
        // Re-throw other errors so onError can handle them
        throw error;
      }
    },
    onSuccess: (result: any) => {
      // Check if this was an aborted mutation  
      if (result === null) {
        return;
      }
      
      // Clear the pending mutation reference
      pendingMutations.current.delete = null;
      
      // Invalidate the specific quote to refetch it
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      
      // Also update the list cache by refetching and updating that specific quote
      queryClient.fetchQuery({ queryKey: [`/api/quotes/${quoteId}`] }).then((updatedQuote) => {
        queryClient.setQueryData(["/api/quotes"], (old: any) => {
          if (!old) return old;
          return old.map((q: any) => q.id === quoteId ? updatedQuote : q);
        });
      });
      
      toast({ title: "Line item deleted successfully" });
    },
    onError: (error: any) => {
      // Clear the pending mutation reference
      pendingMutations.current.delete = null;
      
      // Check if the error is due to abort and handle gracefully
      if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to delete line item", variant: "destructive" });
    },
  });

  const calculatePricingMutation = useMutation({
    mutationFn: async (data: { productId: number; length: number; width: number }) => {
      try {
        const response = await apiRequest("POST", `/api/products/${data.productId}/calculate-price`, {
          length: data.length,
          width: data.width
        }, {
          signal: abortController.current.signal
        });
        return response.json();
      } catch (error: any) {
        // If this is an abort error, don't let it become an unhandled rejection
        if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
          // Return a special marker that onSuccess can ignore
          return { __aborted: true };
        }
        // Re-throw other errors so onError can handle them
        throw error;
      }
    },
    onSuccess: (data: any) => {
      // Check if this was an aborted mutation
      if (data?.__aborted) {
        return;
      }
      
      // Clear the pending mutation reference
      pendingMutations.current.calculate = null;
      
      if (selectedConfigurableProduct) {
        setCalculatedPrice(data.price);
        setNewItem({
          ...newItem,
          description: selectedConfigurableProduct.name,
          unitPrice: data.price.toString(),
        });
      }
    },
    onError: (error: any) => {
      // Clear the pending mutation reference
      pendingMutations.current.calculate = null;
      
      // Check if the error is due to abort and handle gracefully
      if (error instanceof NavigationAbortError || error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('signal is aborted')) {
        // Silent abort - don't show error toast for user-initiated cancellations
        return;
      }
      toast({ title: "Error", description: "Failed to calculate pricing", variant: "destructive" });
    },
  });

  // Set pending mutation references when they start
  const createLineItemWithTracking = (data: any) => {
    pendingMutations.current.create = createLineItemMutation;
    return createLineItemMutation.mutate(data);
  };

  const handleAddItem = () => {
    // Validate new item
    const errors: Record<string, string> = {};
    
    if (!newItem.description.trim()) {
      errors.description = "Description is required";
    }
    
    const quantity = parseFloat(newItem.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      errors.quantity = "Quantity must be greater than 0";
    }
    
    const unitPrice = parseFloat(newItem.unitPrice);
    if (isNaN(unitPrice) || unitPrice < 0) {
      errors.unitPrice = "Unit price must be a valid positive number";
    }
    
    const markupValue = parseFloat(newItem.markupValue || "0");
    if (isNaN(markupValue)) {
      errors.markupValue = "Markup value must be a valid number";
    }
    
    if (Object.keys(errors).length > 0) {
      setNewItemErrors(errors);
      return;
    }
    
    setNewItemErrors({});
    
    const data = {
      description: newItem.description.trim(),
      quantity: parseFloat(newItem.quantity),
      unitPrice: parseFloat(newItem.unitPrice),
      markupType: newItem.markupType,
      markupValue: parseFloat(newItem.markupValue || "0"),
      discountType: newItem.discountType,
      discountValue: parseFloat(newItem.discountValue || "0"),
      retailPrice: newItem.retailPrice ? parseFloat(newItem.retailPrice) : null,
    };
    
    createLineItemMutation.mutate(data);
  };

  const handleProductSelect = (product: Product) => {
    if (product.productType === "configurable") {
      setSelectedConfigurableProduct(product);
      setShowProductDialog(false);
      setShowDimensionDialog(true);
    } else {
      setNewItem({
        ...newItem,
        description: product.name,
        unitPrice: product.defaultUnitPrice?.toString() || "0",
        markupType: product.defaultMarkupType || "percentage",
        markupValue: product.defaultMarkupValue?.toString() || "0",
      });
      setShowProductDialog(false);
      setShowNewItemForm(true);
    }
  };

  const handleDimensionSubmit = () => {
    if (selectedConfigurableProduct) {
      const length = parseFloat(dimensions.length) || 0;
      const width = parseFloat(dimensions.width) || 0;

      calculatePricingMutation.mutate({
        productId: selectedConfigurableProduct.id,
        length,
        width,
      }, {
        onSuccess: () => {
          // Close dialog, show the new item form, and reset dimensions only after successful calculation
          setShowDimensionDialog(false);
          setShowNewItemForm(true);
          setDimensions({ length: "", width: "" });
        }
      });
    }
  };

  // Drag and drop setup
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Group line items by groupId
  const groupedLineItems = useMemo(() => {
    const grouped: Record<string, LineItem[]> = {};
    const ungrouped: LineItem[] = [];
    
    lineItems.forEach(item => {
      if (item.groupId) {
        if (!grouped[item.groupId]) {
          grouped[item.groupId] = [];
        }
        grouped[item.groupId].push(item);
      } else {
        ungrouped.push(item);
      }
    });
    
    // Sort items within each group by position
    Object.keys(grouped).forEach(groupId => {
      grouped[groupId].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    });
    
    // Sort ungrouped items by position
    ungrouped.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    
    return { grouped, ungrouped };
  }, [lineItems]);

  // Sort groups by position
  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => a.position - b.position);
  }, [groups]);

  // Group management handlers
  const handleCreateGroup = (title: string) => {
    const groupId = generateGroupId();
    const position = groups.length;
    
    createGroupMutation.mutate({
      id: groupId,
      title,
      quoteId,
      position
    });
  };

  const handleToggleGroupCollapse = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (group) {
      updateGroupMutation.mutate({
        groupId,
        data: { isCollapsed: !group.isCollapsed }
      });
    }
  };

  const handleEditGroupTitle = (groupId: string, title: string) => {
    updateGroupMutation.mutate({
      groupId,
      data: { title }
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    // Move all items in this group to ungrouped
    const itemsInGroup = groupedLineItems.grouped[groupId] || [];
    const moves = itemsInGroup.map((item, index) => ({
      id: item.id,
      groupId: null,
      position: index
    }));
    
    if (moves.length > 0) {
      reorderLineItemsMutation.mutate(moves);
    }
    
    deleteGroupMutation.mutate(groupId);
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Handle group reordering
    if (activeId.startsWith('group-') && overId.startsWith('group-')) {
      const activeGroupId = activeId.replace('group-', '');
      const overGroupId = overId.replace('group-', '');
      
      if (activeGroupId !== overGroupId) {
        const activeIndex = sortedGroups.findIndex(g => g.id === activeGroupId);
        const overIndex = sortedGroups.findIndex(g => g.id === overGroupId);
        
        const newGroups = [...sortedGroups];
        const [removed] = newGroups.splice(activeIndex, 1);
        newGroups.splice(overIndex, 0, removed);
        
        const groupPositions = newGroups.map((group, index) => ({
          id: group.id,
          position: index
        }));
        
        reorderGroupsMutation.mutate(groupPositions);
      }
      return;
    }

    // Handle line item reordering
    const activeItemId = parseInt(activeId.replace('item-', ''));
    const activeItem = lineItems.find(item => item.id === activeItemId);
    
    if (!activeItem) return;

    let targetGroupId: string | null = null;
    let targetPosition = 0;

    // Determine target group and position
    if (overId.startsWith('group-')) {
      targetGroupId = overId.replace('group-', '');
      targetPosition = groupedLineItems.grouped[targetGroupId]?.length || 0;
    } else if (overId === 'ungrouped') {
      targetGroupId = null;
      targetPosition = groupedLineItems.ungrouped.length;
    } else if (overId.startsWith('item-')) {
      const overItemId = parseInt(overId.replace('item-', ''));
      const overItem = lineItems.find(item => item.id === overItemId);
      
      if (overItem) {
        targetGroupId = overItem.groupId;
        
        const itemsInGroup = targetGroupId 
          ? groupedLineItems.grouped[targetGroupId] || []
          : groupedLineItems.ungrouped;
        
        targetPosition = itemsInGroup.findIndex(item => item.id === overItemId);
        if (targetPosition === -1) targetPosition = 0;
      }
    }

    // Only proceed if there's a change in group or position
    const isSameGroup = activeItem.groupId === targetGroupId;
    const currentPosition = isSameGroup ? 
      (targetGroupId ? groupedLineItems.grouped[targetGroupId] || [] : groupedLineItems.ungrouped)
        .findIndex(item => item.id === activeItemId) : -1;
    
    if (isSameGroup && currentPosition === targetPosition) {
      return;
    }

    // Create moves for all affected items to ensure proper positioning
    const moves: { id: number; groupId: string | null; position: number }[] = [];
    
    // Get all items in the target group (excluding the active item)
    const targetGroupItems = targetGroupId 
      ? (groupedLineItems.grouped[targetGroupId] || []).filter(item => item.id !== activeItemId)
      : groupedLineItems.ungrouped.filter(item => item.id !== activeItemId);
    
    // If moving to a different group, also update positions in the source group
    if (!isSameGroup && activeItem.groupId) {
      const sourceGroupItems = activeItem.groupId 
        ? (groupedLineItems.grouped[activeItem.groupId] || []).filter(item => item.id !== activeItemId)
        : groupedLineItems.ungrouped.filter(item => item.id !== activeItemId);
      
      // Reposition items in source group
      sourceGroupItems.forEach((item, index) => {
        moves.push({
          id: item.id,
          groupId: activeItem.groupId,
          position: index
        });
      });
    }
    
    // Insert the active item at the target position and adjust other items
    const newTargetGroupItems = [...targetGroupItems];
    newTargetGroupItems.splice(targetPosition, 0, activeItem);
    
    // Create moves for all items in target group
    newTargetGroupItems.forEach((item, index) => {
      moves.push({
        id: item.id,
        groupId: targetGroupId,
        position: index
      });
    });

    reorderLineItemsMutation.mutate(moves);
  };

  // Sortable Line Item Row Component (memoized to prevent focus loss)
  const SortableLineItemRow = memo(({ item, rowIndex }: { item: LineItem; rowIndex: number }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: `item-${item.id}` });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    // Calculate values using current local values
    const currentCost = parseFloat(getCurrentValue(item.id, 'unitPrice')) || 0;
    const currentMarkupValue = parseFloat(getCurrentValue(item.id, 'markupValue')) || 0;
    const currentMarkupType = getCurrentValue(item.id, 'markupType') || 'percentage';
    const currentQuantity = parseFloat(getCurrentValue(item.id, 'quantity')) || 0;
    
    // Calculate price (cost + markup)
    let price = currentCost;
    if (currentMarkupType === 'percentage') {
      price = currentCost + (currentCost * (currentMarkupValue / 100));
    } else {
      price = currentCost + currentMarkupValue;
    }
    
    // Calculate margin (profit amount)
    const marginAmount = calculateLineItemMargin(
      currentQuantity,
      currentCost,
      currentMarkupType,
      currentMarkupValue,
      item.discountType,
      item.discountValue
    );
    
    // Calculate total
    const total = calculateLineItemTotal(
      currentQuantity,
      currentCost,
      currentMarkupType,
      currentMarkupValue,
      item.discountType,
      item.discountValue
    );

    return (
      <tr
        ref={setNodeRef}
        style={style}
        {...attributes}
        key={item.id}
        className="hover:bg-gray-50"
        data-testid={`row-line-item-${item.id}`}
      >
        {/* Drag handle */}
        <td className="border-r border-gray-300 px-2 py-1 w-8">
          <div {...listeners} className="cursor-grab hover:cursor-grabbing text-gray-400">
            <GripVertical className="h-4 w-4" />
          </div>
        </td>

        {/* Description - Always visible */}
        <td className="border-r border-gray-300 px-3 py-1">
          <Input
            value={getCurrentValue(item.id, 'description')}
            onChange={(e) => {
              handleFieldChange(item.id, "description", e.target.value);
              markActive(`${item.id}-description`, e.currentTarget);
            }}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, 'description')}
            onFocus={(e) => {
              activeInputs.current.add(`${item.id}-description`);
              markActive(`${item.id}-description`, e.currentTarget);
            }}
            onBlur={() => {
              handleFieldBlur(item.id, "description");
              activeKeyRef.current = null;
            }}
            className="border-0 bg-transparent p-1 text-sm focus:ring-1 focus:ring-blue-500"
            data-testid={`input-description-${item.id}`}
          />
          {validationErrors[`${item.id}-description`] && (
            <div className="text-xs text-red-500 mt-1">{validationErrors[`${item.id}-description`]}</div>
          )}
        </td>

        {/* Quantity - Always visible */}
        <td className="border-r border-gray-300 px-3 py-1 w-20 text-center">
          <Input
            value={getCurrentValue(item.id, 'quantity')}
            onChange={(e) => {
              handleFieldChange(item.id, "quantity", e.target.value);
              markActive(`${item.id}-quantity`, e.currentTarget);
            }}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, 'quantity')}
            onFocus={(e) => {
              activeInputs.current.add(`${item.id}-quantity`);
              markActive(`${item.id}-quantity`, e.currentTarget);
            }}
            onBlur={() => {
              handleFieldBlur(item.id, "quantity");
              activeKeyRef.current = null;
            }}
            className="border-0 bg-transparent p-1 text-center text-sm focus:ring-1 focus:ring-blue-500"
            data-testid={`input-quantity-${item.id}`}
          />
          {validationErrors[`${item.id}-quantity`] && (
            <div className="text-xs text-red-500 mt-1">{validationErrors[`${item.id}-quantity`]}</div>
          )}
        </td>

        {/* Cost - Hidden on small screens */}
        <td className="border-r border-gray-300 px-3 py-1 text-center hidden lg:table-cell">
          <Input
            value={getCurrentValue(item.id, 'unitPrice')}
            onChange={(e) => {
              handleFieldChange(item.id, "unitPrice", e.target.value);
              markActive(`${item.id}-unitPrice`, e.currentTarget);
            }}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, 'unitPrice')}
            onFocus={(e) => {
              activeInputs.current.add(`${item.id}-unitPrice`);
              markActive(`${item.id}-unitPrice`, e.currentTarget);
            }}
            onBlur={() => {
              handleFieldBlur(item.id, "unitPrice");
              activeKeyRef.current = null;
            }}
            className="border-0 bg-transparent p-1 text-center text-sm focus:ring-1 focus:ring-blue-500"
            data-testid={`input-unit-price-${item.id}`}
          />
          {validationErrors[`${item.id}-unitPrice`] && (
            <div className="text-xs text-red-500 mt-1">{validationErrors[`${item.id}-unitPrice`]}</div>
          )}
        </td>

        {/* Markup% - Hidden on small screens */}
        <td className="border-r border-gray-300 px-3 py-1 text-center hidden lg:table-cell">
          <div className="flex items-center space-x-1">
            <Input
              value={getCurrentValue(item.id, 'markupValue')}
              onChange={(e) => {
                handleFieldChange(item.id, "markupValue", e.target.value);
                markActive(`${item.id}-markupValue`, e.currentTarget);
              }}
              onKeyDown={(e) => handleKeyDown(e, rowIndex, 'markupValue')}
              onFocus={(e) => {
                activeInputs.current.add(`${item.id}-markupValue`);
                markActive(`${item.id}-markupValue`, e.currentTarget);
              }}
              onBlur={() => {
                handleFieldBlur(item.id, "markupValue");
                activeKeyRef.current = null;
              }}
              className="border-0 bg-transparent p-1 text-center text-sm focus:ring-1 focus:ring-blue-500 flex-1"
              data-testid={`input-markup-value-${item.id}`}
            />
            <Select
              value={getCurrentValue(item.id, 'markupType')}
              onValueChange={(value) => {
                activeInputs.current.delete(`${item.id}-markupType`);
                handleFieldChange(item.id, "markupType", value);
              }}
              onOpenChange={(open) => {
                if (open) {
                  activeInputs.current.add(`${item.id}-markupType`);
                } else {
                  activeInputs.current.delete(`${item.id}-markupType`);
                }
              }}
            >
              <SelectTrigger className="w-12 h-6 border-0 bg-transparent p-0 text-xs" data-testid={`select-markup-type-${item.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">%</SelectItem>
                <SelectItem value="dollar">$</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {validationErrors[`${item.id}-markupValue`] && (
            <div className="text-xs text-red-500 mt-1">{validationErrors[`${item.id}-markupValue`]}</div>
          )}
        </td>

        {/* Price - Always visible */}
        <td className="border-r border-gray-300 px-3 py-1 text-center text-sm" data-testid={`text-price-${item.id}`}>
          {formatCurrency(price)}
        </td>

        {/* Margin$ - Hidden on small screens */}
        <td className="border-r border-gray-300 px-3 py-1 text-center text-sm hidden md:table-cell" data-testid={`text-margin-${item.id}`}>
          {formatCurrency(marginAmount)}
        </td>

        {/* Total - Always visible */}
        <td className="border-r border-gray-300 px-3 py-1 text-center font-medium text-sm" data-testid={`text-total-${item.id}`}>
          {formatCurrency(total)}
        </td>

        {/* Taxable - Always visible */}
        <td className="border-r border-gray-300 px-2 py-1 text-center">
          <div className="flex justify-center">
            <Checkbox
              checked={item.isTaxable !== false}
              onCheckedChange={(checked) => {
                updateLineItemMutation.mutate({ 
                  id: item.id, 
                  data: { isTaxable: checked === true },
                  skipInvalidation: false
                });
              }}
              data-testid={`checkbox-taxable-${item.id}`}
            />
          </div>
        </td>

        {/* Actions - Always visible */}
        <td className="px-3 py-1 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteLineItemMutation.mutate(item.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
            data-testid={`button-delete-${item.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </td>
      </tr>
    );
  });

  // Clean descriptions function to remove PDF filename prefixes
  const cleanDescriptions = async () => {
    if (!lineItems.length) {
      toast({ title: "No Items", description: "No line items to clean", variant: "destructive" });
      return;
    }

    // Find items that have filename prefixes to clean
    const itemsToClean = lineItems.filter(item => 
      /^\[.*?\]\s+/.test(item.description)
    );

    if (itemsToClean.length === 0) {
      toast({ title: "Nothing to Clean", description: "No filename prefixes found in descriptions" });
      return;
    }

    setIsCleaningDescriptions(true);
    let successCount = 0;
    let errorCount = 0;

    // Cancel any outstanding debounced saves to prevent race conditions
    Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer));
    debounceTimers.current = {};

    try {
      // Update each item that needs cleaning (with batch invalidation)
      for (const item of itemsToClean) {
        try {
          const cleanedDescription = item.description.replace(/^\[.*?\]\s+/, '');
          
          // Update local state immediately for feedback
          setLocalValues(prev => ({
            ...prev,
            [item.id]: {
              ...(prev[item.id] ?? {}),
              description: cleanedDescription
            }
          }));

          // Update on server with skipInvalidation to prevent individual query refetches
          await updateLineItemMutation.mutateAsync({ 
            id: item.id, 
            data: { description: cleanedDescription },
            skipInvalidation: true
          });
          
          successCount++;
        } catch (error) {
          errorCount++;
          console.error(`Failed to clean description for item ${item.id}:`, error);
        }
      }

      // Perform batch invalidation after all updates are complete
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      
      // Also update the list cache by refetching and updating that specific quote
      queryClient.fetchQuery({ queryKey: [`/api/quotes/${quoteId}`] }).then((updatedQuote) => {
        queryClient.setQueryData(["/api/quotes"], (old: any) => {
          if (!old) return old;
          return old.map((q: any) => q.id === quoteId ? updatedQuote : q);
        });
      });

      // Show results
      if (successCount > 0 && errorCount === 0) {
        toast({ 
          title: "Descriptions Cleaned", 
          description: `Successfully cleaned ${successCount} description${successCount > 1 ? 's' : ''}` 
        });
      } else if (successCount > 0 && errorCount > 0) {
        toast({ 
          title: "Partial Success", 
          description: `Cleaned ${successCount} descriptions, ${errorCount} failed`,
          variant: "default"
        });
      } else {
        toast({ 
          title: "Cleanup Failed", 
          description: "Failed to clean any descriptions",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "An error occurred while cleaning descriptions",
        variant: "destructive"
      });
    } finally {
      setIsCleaningDescriptions(false);
    }
  };

  // Product filtering logic
  const manufacturers = useMemo(() => {
    if (!products) return [];
    const uniqueManufacturers = Array.from(new Set(products.map(p => p.manufacturer || "Unknown")));
    return uniqueManufacturers.sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    return products.filter(product => {
      const matchesSearch = searchTerm === "" || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const productManufacturer = product.manufacturer || "Unknown";
      const matchesManufacturer = selectedManufacturer === "all" || 
        productManufacturer === selectedManufacturer;
      
      return matchesSearch && matchesManufacturer;
    });
  }, [products, searchTerm, selectedManufacturer]);

  const groupedProducts = useMemo(() => {
    return filteredProducts.reduce((groups, product) => {
      const manufacturer = product.manufacturer || "Unknown";
      if (!groups[manufacturer]) {
        groups[manufacturer] = [];
      }
      groups[manufacturer].push(product);
      return groups;
    }, {} as Record<string, Product[]>);
  }, [filteredProducts]);

  return (
    <div className="mb-6">
      <div className="border-b border-gray-300 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Line Items
          </h2>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={cleanDescriptions}
              disabled={isUnsavedQuote || isCleaningDescriptions}
              data-testid="button-clean-descriptions"
            >
              {isCleaningDescriptions ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Clean Descriptions
            </Button>
            <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-sm"
                  disabled={isUnsavedQuote}
                >
                  <Package className="mr-2 h-4 w-4" />
                  From Catalog
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>Select Product from Catalog</DialogTitle>
                </DialogHeader>
                
                <div className="flex flex-col h-full max-h-[70vh]">
                  {/* Search and Filter Controls */}
                  <div className="flex gap-4 mb-4 p-1">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Search products..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                        data-testid="input-product-search"
                      />
                    </div>
                    
                    <Select value={selectedManufacturer} onValueChange={setSelectedManufacturer}>
                      <SelectTrigger className="w-48" data-testid="select-manufacturer-filter">
                        <SelectValue>
                          <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4" />
                            {selectedManufacturer === "all" ? "All Manufacturers" : selectedManufacturer}
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Manufacturers</SelectItem>
                        {manufacturers.map((manufacturer) => (
                          <SelectItem key={manufacturer} value={manufacturer}>
                            {manufacturer}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedManufacturer("all");
                      }}
                      className="px-3"
                      data-testid="button-clear-filters"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Products Grid */}
                  <div className="flex-1 overflow-y-auto border rounded-lg">
                    {Object.keys(groupedProducts).length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        No products found matching your criteria.
                      </div>
                    ) : (
                      Object.entries(groupedProducts).map(([manufacturer, products]) => (
                        <div key={manufacturer} className="border-b border-gray-200 last:border-b-0">
                          <div className="bg-gray-50 px-4 py-2 font-medium text-sm text-gray-700 border-b border-gray-200">
                            {manufacturer} ({products.length})
                          </div>
                          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {products.map((product) => (
                              <div
                                key={product.id}
                                onClick={() => handleProductSelect(product)}
                                className="p-3 border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors"
                                data-testid={`product-card-${product.id}`}
                              >
                                <div className="font-medium text-sm text-gray-900 mb-1">
                                  {product.name}
                                </div>
                                {product.description && (
                                  <div className="text-xs text-gray-600 mb-2 line-clamp-2">
                                    {product.description}
                                  </div>
                                )}
                                <div className="flex justify-between items-center">
                                  <div className="text-sm font-medium text-green-600">
                                    {formatCurrency(product.defaultUnitPrice || 0)}
                                  </div>
                                  {product.productType === "configurable" && (
                                    <Badge variant="secondary" className="text-xs">
                                      Configurable
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              className="text-sm"
              disabled={isUnsavedQuote}
              onClick={() => setLocation(`/configure/screen?quoteId=${quoteId}`)}
              data-testid="button-configure-screen"
            >
              <Settings className="mr-2 h-4 w-4" />
              Configure Screen
            </Button>
            <Button
              onClick={() => setShowNewItemForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
              disabled={isUnsavedQuote}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white">
        {/* Alert message for unsaved quotes */}
        {isUnsavedQuote && (
          <div className="p-4 border-b border-gray-300 bg-blue-50">
            <div className="text-blue-800 text-sm">
              <strong>Save the quote first</strong> - You need to save the quote before you can add line items.
            </div>
          </div>
        )}
        
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-300 divide-y divide-gray-300">
              <colgroup>
                <col style={{width: '40px'}} /> {/* Drag Handle */}
                <col style={{width: '26%'}} /> {/* Description */}
                <col style={{width: '80px'}} /> {/* Quantity */}
                <col style={{width: '100px'}} /> {/* Cost */}
                <col style={{width: '160px'}} /> {/* Markup% */}
                <col style={{width: '120px'}} /> {/* Price */}
                <col style={{width: '100px'}} /> {/* Margin$ */}
                <col style={{width: '140px'}} /> {/* Total */}
                <col style={{width: '70px'}} /> {/* Taxable */}
                <col style={{width: '80px'}} /> {/* Actions */}
              </colgroup>
              <thead>
                <tr className="bg-gray-100">
                  <th className="border-r border-gray-300 px-2 py-2 text-center text-sm font-medium text-gray-700 w-8">
                    <GripVertical className="h-4 w-4 mx-auto" />
                  </th>
                  <th className="border-r border-gray-300 px-3 py-2 text-left text-sm font-medium text-gray-700">
                    Description
                  </th>
                  <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700">
                    QTY
                  </th>
                  <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 hidden lg:table-cell">
                    Cost
                  </th>
                  <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 hidden lg:table-cell">
                    Markup%
                  </th>
                  <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700">
                    Price
                  </th>
                  <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 hidden md:table-cell">
                    Margin$
                  </th>
                  <th className="border-r border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700">
                    Total
                  </th>
                  <th className="border-r border-gray-300 px-2 py-2 text-center text-sm font-medium text-gray-700">
                    Taxable
                  </th>
                  <th className="px-3 py-2 text-center text-sm font-medium text-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {/* Render ungrouped items first */}
                {groupedLineItems.ungrouped.length > 0 && (
                  <>
                    <UngroupedSection 
                      lineItems={groupedLineItems.ungrouped}
                      onCreateGroup={() => setShowCreateGroupDialog(true)}
                    />
                    <SortableContext 
                      items={groupedLineItems.ungrouped.map(item => `item-${item.id}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      {groupedLineItems.ungrouped.map((item, rowIndex) => (
                        <SortableLineItemRow
                          key={item.id}
                          item={item}
                          rowIndex={rowIndex}
                        />
                      ))}
                    </SortableContext>
                  </>
                )}

                {/* Render groups */}
                {sortedGroups.map((group) => {
                  const groupItems = groupedLineItems.grouped[group.id] || [];
                  
                  return (
                    <>
                      <GroupHeader
                        key={group.id}
                        group={group}
                        lineItems={groupItems}
                        onToggleCollapse={handleToggleGroupCollapse}
                        onEditTitle={handleEditGroupTitle}
                        onDeleteGroup={handleDeleteGroup}
                        isEditing={editingGroupId === group.id}
                        onStartEdit={() => setEditingGroupId(group.id)}
                        onCancelEdit={() => setEditingGroupId(null)}
                      />
                      
                      {!group.isCollapsed && (
                        <SortableContext 
                          items={groupItems.map(item => `item-${item.id}`)}
                          strategy={verticalListSortingStrategy}
                        >
                          {groupItems.map((item, rowIndex) => (
                            <SortableLineItemRow
                              key={item.id}
                              item={item}
                              rowIndex={rowIndex}
                            />
                          ))}
                        </SortableContext>
                      )}
                      
                      {!group.isCollapsed && (
                        <GroupFooter
                          group={group}
                          lineItems={groupItems}
                          onAddItem={() => setShowNewItemForm(true)}
                        />
                      )}
                    </>
                  );
                })}

                {/* Show message if no items at all */}
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                      No line items yet. Click "Add Item" to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* DragOverlay for visual feedback */}
          <DragOverlay>
            {activeId ? (
              <div className="bg-white shadow-lg border border-gray-300 rounded p-2">
                Dragging {activeId.startsWith('group-') ? 'Group' : 'Item'}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Add new item form */}
      {showNewItemForm && (
        <div className="bg-gray-50 border-t border-gray-300 p-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <Input
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Enter description"
                className="text-sm"
                data-testid="input-new-description"
              />
              {newItemErrors.description && (
                <div className="text-xs text-red-500 mt-1">{newItemErrors.description}</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <Input
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                placeholder="1"
                type="number"
                step="0.01"
                className="text-sm"
                data-testid="input-new-quantity"
              />
              {newItemErrors.quantity && (
                <div className="text-xs text-red-500 mt-1">{newItemErrors.quantity}</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
              <Input
                value={newItem.unitPrice}
                onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                placeholder="0.00"
                type="number"
                step="0.01"
                className="text-sm"
                data-testid="input-new-unit-price"
              />
              {newItemErrors.unitPrice && (
                <div className="text-xs text-red-500 mt-1">{newItemErrors.unitPrice}</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Markup</label>
              <div className="flex space-x-1">
                <Input
                  value={newItem.markupValue}
                  onChange={(e) => setNewItem({ ...newItem, markupValue: e.target.value })}
                  placeholder="0"
                  type="number"
                  step="0.01"
                  min="-10000000"
                  className="text-sm flex-1"
                  data-testid="input-new-markup-value"
                />
                <Select
                  value={newItem.markupType}
                  onValueChange={(value: "percentage" | "dollar") => 
                    setNewItem({ ...newItem, markupType: value })
                  }
                >
                  <SelectTrigger className="w-16 text-sm" data-testid="select-new-markup-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">%</SelectItem>
                    <SelectItem value="dollar">$</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newItemErrors.markupValue && (
                <div className="text-xs text-red-500 mt-1">{newItemErrors.markupValue}</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
              <div className="bg-gray-100 border border-gray-300 rounded px-3 py-2 text-sm text-gray-700">
                {formatCurrency(
                  calculateLineItemTotal(
                    newItem.quantity,
                    newItem.unitPrice,
                    newItem.markupType,
                    newItem.markupValue
                  )
                )}
              </div>
            </div>
            <div className="flex items-end space-x-2">
              <Button
                onClick={handleAddItem}
                className="bg-green-600 hover:bg-green-700 text-white text-sm"
                data-testid="button-save-item"
              >
                Save
              </Button>
              <Button
                onClick={() => setShowNewItemForm(false)}
                variant="outline"
                className="text-sm"
                data-testid="button-cancel-item"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dimension Dialog */}
      <Dialog open={showDimensionDialog} onOpenChange={setShowDimensionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Dimensions</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Length (ft)
              </label>
              <Input
                type="number"
                step="0.1"
                value={dimensions.length}
                onChange={(e) => setDimensions({ ...dimensions, length: e.target.value })}
                placeholder="0.0"
                data-testid="input-length"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Width (ft)
              </label>
              <Input
                type="number"
                step="0.1"
                value={dimensions.width}
                onChange={(e) => setDimensions({ ...dimensions, width: e.target.value })}
                placeholder="0.0"
                data-testid="input-width"
              />
            </div>
            {calculatedPrice !== null && (
              <div className="p-3 bg-green-50 border border-green-200 rounded">
                <div className="text-sm text-green-800">
                  Calculated Price: {formatCurrency(calculatedPrice)}
                </div>
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setShowDimensionDialog(false)}
                data-testid="button-cancel-dimensions"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDimensionSubmit}
                disabled={!dimensions.length || !dimensions.width || calculatePricingMutation.isPending}
                data-testid="button-confirm-dimensions"
              >
                {calculatePricingMutation.isPending ? "Calculating..." : "Add to Quote"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Group Dialog */}
      <CreateGroupDialog
        open={showCreateGroupDialog}
        onClose={() => setShowCreateGroupDialog(false)}
        onCreateGroup={handleCreateGroup}
      />

    </div>
  );
}