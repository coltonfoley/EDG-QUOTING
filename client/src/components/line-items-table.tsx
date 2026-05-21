import React, { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef, memo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Trash2, Plus, Package, Search, Filter, X, FileText, Loader2, GripVertical, Info, Settings, Percent } from "lucide-react";
import { formatCurrency, calculateLineItemTotal, calculateLineItemMargin, applyDiscountToPrice, isValidNumber, clampValue, roundCurrency, generateGroupId, sanitizeNumberString } from "@/lib/utils";
import { apiRequest, NavigationAbortError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LineItem, Product, Color, ProductColor } from "@shared/schema";
import { getProductPricingBreakdown } from "@shared/pricing";
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
  UngroupedDropZone,
  CreateGroupDialog,
  type Group 
} from './group-components';
import { ProductConfigurator } from './product-configurator';

interface LineItemsTableProps {
  quoteId: number;
  lineItems: LineItem[];
  tariffRate: string | number;
}

type PricingDefaultResponse = {
  scope: string;
  markupType: "percentage";
  markupValue: string;
  updatedAt: string | null;
};

function HeaderHelp({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex h-4 w-4 items-center justify-center text-blue-500 hover:text-blue-700"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface SortableLineItemRowProps {
  item: LineItem;
  rowIndex: number;
  getCurrentValue: (itemId: number, field: 'description' | 'quantity' | 'unitPrice' | 'markupType' | 'markupValue') => string;
  handleFieldChange: (itemId: number, field: string, value: any) => void;
  markActive: (key: string, el: HTMLInputElement | null) => void;
  handleKeyDown: (e: React.KeyboardEvent, rowIndex: number, column: 'description' | 'quantity' | 'unitPrice' | 'markupValue') => void;
  handleFieldBlur: (itemId: number, field: 'description' | 'quantity' | 'unitPrice' | 'markupType' | 'markupValue') => void;
  validationErrors: Record<string, string>;
  tariffRate: string | number;
  updateLineItemMutation: any;
  deleteLineItemMutation: any;
  formatCurrency: (value: number | string) => string;
  calculateLineItemMargin: typeof calculateLineItemMargin;
  calculateLineItemTotal: typeof calculateLineItemTotal;
  availableColors?: (ProductColor & { color: Color })[];
}

const SortableLineItemRow = memo(function SortableLineItemRow({
  item,
  rowIndex,
  getCurrentValue,
  handleFieldChange,
  markActive,
  handleKeyDown,
  handleFieldBlur,
  validationErrors,
  tariffRate,
  updateLineItemMutation,
  deleteLineItemMutation,
  formatCurrency,
  calculateLineItemMargin,
  calculateLineItemTotal,
  availableColors,
}: SortableLineItemRowProps) {
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const [colorUpdatePending, setColorUpdatePending] = useState(false);
  const [optimisticColor, setOptimisticColor] = useState<{ name: string; hexCode: string } | null>(null);
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
    item.discountValue,
    tariffRate,
    item.isTariffApplicable || false
  );
  
  // Calculate total
  const total = calculateLineItemTotal(
    currentQuantity,
    currentCost,
    currentMarkupType,
    currentMarkupValue,
    item.discountType,
    item.discountValue,
    tariffRate,
    item.isTariffApplicable || false
  );

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="hover:bg-muted"
      data-testid={`row-line-item-${item.id}`}
    >
      {/* Drag handle */}
      <td className="border-r border-border px-2 py-1 w-8">
        <div {...listeners} className="cursor-grab hover:cursor-grabbing text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
      </td>

      {/* Description - Always visible */}
      <td className="border-r border-border px-3 py-1">
        <Input
          value={getCurrentValue(item.id, 'description')}
          onChange={(e) => {
            handleFieldChange(item.id, "description", e.target.value);
            markActive(`${item.id}-description`, e.currentTarget);
          }}
          onKeyDown={(e) => handleKeyDown(e, rowIndex, 'description')}
          onFocus={(e) => {
            markActive(`${item.id}-description`, e.currentTarget);
          }}
          onBlur={() => {
            handleFieldBlur(item.id, "description");
          }}
          className="border-0 bg-transparent p-1 text-sm focus:ring-1 focus:ring-blue-500"
          data-testid={`input-description-${item.id}`}
        />
        {(() => {
          try {
            const configData = item.configData ? (typeof item.configData === 'string' ? JSON.parse(item.configData) : item.configData) : null;
            const rawColors = configData?.colors;
            const currentColors = optimisticColor ? [optimisticColor] : rawColors;
            if (currentColors && Array.isArray(currentColors) && currentColors.length > 0) {
              const hasAvailableColors = availableColors && availableColors.length > 0 && !colorUpdatePending;
              return (
                <div className="relative flex gap-1 mt-1 flex-wrap">
                  {currentColors.map((color: { name: string; hexCode: string }, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        if (hasAvailableColors) {
                          e.stopPropagation();
                          setColorDropdownOpen(!colorDropdownOpen);
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                        hasAvailableColors
                          ? 'bg-muted hover:bg-muted/80 cursor-pointer border border-transparent hover:border-border'
                          : 'bg-muted cursor-default'
                      }`}
                      data-testid={`color-badge-${item.id}-${idx}`}
                      title={hasAvailableColors ? `Click to change color` : color.name}
                    >
                      <div 
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: color.hexCode }}
                      />
                      <span>{color.name}</span>
                      {hasAvailableColors && (
                        <svg className="w-3 h-3 ml-0.5 text-muted-foreground" viewBox="0 0 12 12" fill="none">
                          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  ))}
                  {colorDropdownOpen && hasAvailableColors && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setColorDropdownOpen(false)}
                      />
                      <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-md p-1 min-w-[140px]">
                        {availableColors!.map((pc) => {
                          const isCurrentColor = currentColors.some(
                            (c: { name: string; hexCode: string }) => c.name === pc.color.name
                          );
                          return (
                            <button
                              key={pc.color.id}
                              type="button"
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors ${
                                isCurrentColor ? 'bg-accent font-medium' : ''
                              }`}
                              data-testid={`color-option-${item.id}-${pc.color.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const freshConfigData = item.configData 
                                  ? (typeof item.configData === 'string' ? JSON.parse(item.configData) : item.configData) 
                                  : {};
                                const updatedConfigData = {
                                  ...freshConfigData,
                                  colors: [{ name: pc.color.name, hexCode: pc.color.hexCode }]
                                };
                                setOptimisticColor({ name: pc.color.name, hexCode: pc.color.hexCode });
                                setColorUpdatePending(true);
                                updateLineItemMutation.mutate({
                                  id: item.id,
                                  data: { configData: updatedConfigData },
                                  skipInvalidation: false
                                }, {
                                  onSettled: () => {
                                    setColorUpdatePending(false);
                                    setOptimisticColor(null);
                                  }
                                });
                                setColorDropdownOpen(false);
                              }}
                            >
                              <div 
                                className="w-4 h-4 rounded-full border border-border flex-shrink-0"
                                style={{ backgroundColor: pc.color.hexCode }}
                              />
                              <span>{pc.color.name}</span>
                              {isCurrentColor && (
                                <svg className="w-3 h-3 ml-auto text-primary" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            }
          } catch (e) {
            // Silent fail if configData is malformed
          }
          return null;
        })()}
        {validationErrors[`${item.id}-description`] && (
          <div className="text-xs text-red-500 mt-1">{validationErrors[`${item.id}-description`]}</div>
        )}
      </td>

      {/* Quantity - Always visible */}
      <td className="border-r border-border px-3 py-1 w-20 text-center">
        <Input
          value={getCurrentValue(item.id, 'quantity')}
          onChange={(e) => {
            handleFieldChange(item.id, "quantity", e.target.value);
            markActive(`${item.id}-quantity`, e.currentTarget);
          }}
          onKeyDown={(e) => handleKeyDown(e, rowIndex, 'quantity')}
          onFocus={(e) => {
            markActive(`${item.id}-quantity`, e.currentTarget);
          }}
          onBlur={() => {
            handleFieldBlur(item.id, "quantity");
          }}
          className="border-0 bg-transparent p-1 text-center text-sm focus:ring-1 focus:ring-blue-500"
          data-testid={`input-quantity-${item.id}`}
        />
        {validationErrors[`${item.id}-quantity`] && (
          <div className="text-xs text-red-500 mt-1">{validationErrors[`${item.id}-quantity`]}</div>
        )}
      </td>

      {/* Cost - Hidden on small screens */}
      <td className="border-r border-border px-3 py-1 text-center hidden lg:table-cell">
        <div className="flex items-center gap-1">
          <Input
            value={getCurrentValue(item.id, 'unitPrice')}
            onChange={(e) => {
              handleFieldChange(item.id, "unitPrice", e.target.value);
              markActive(`${item.id}-unitPrice`, e.currentTarget);
            }}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, 'unitPrice')}
            onFocus={(e) => {
              markActive(`${item.id}-unitPrice`, e.currentTarget);
            }}
            onBlur={() => {
              handleFieldBlur(item.id, "unitPrice");
            }}
            className="border-0 bg-transparent p-1 text-center text-sm focus:ring-1 focus:ring-blue-500 flex-1"
            data-testid={`input-unit-price-${item.id}`}
          />
          {item.retailPrice && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-blue-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="bg-popover text-popover-foreground p-2 text-xs max-w-xs">
                  <div className="font-semibold mb-1">Internal Price Breakdown:</div>
                  <div>Manufacturer MSRP: {formatCurrency(parseFloat(item.retailPrice.toString()))}</div>
                  <div>
                    Supplier Discount: {(() => {
                      const retail = parseFloat(item.retailPrice.toString());
                      const cost = parseFloat(getCurrentValue(item.id, 'unitPrice'));
                      const discountAmount = retail - cost;
                      const discountPercent = retail > 0 ? (discountAmount / retail * 100).toFixed(1) : 0;
                      return discountAmount > 0 
                        ? `${formatCurrency(discountAmount)} (${discountPercent}%)`
                        : 'No supplier discount';
                    })()}
                  </div>
                  <div className="border-t border-border mt-1 pt-1">
                    EDG Cost: {formatCurrency(parseFloat(getCurrentValue(item.id, 'unitPrice')))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {validationErrors[`${item.id}-unitPrice`] && (
          <div className="text-xs text-red-500 mt-1">{validationErrors[`${item.id}-unitPrice`]}</div>
        )}
      </td>

      {/* Markup - Hidden on small screens */}
      <td className="border-r border-border px-3 py-1 text-center hidden lg:table-cell">
        <div className="flex items-center space-x-1">
          <Input
            type="number"
            min="0"
            value={getCurrentValue(item.id, 'markupValue')}
            onChange={(e) => {
              // SAFETY: Prevent negative markup values
              const value = e.target.value;
              const numValue = parseFloat(value);
              if (!isNaN(numValue) && numValue < 0) {
                handleFieldChange(item.id, "markupValue", "0");
              } else {
                handleFieldChange(item.id, "markupValue", value);
              }
              markActive(`${item.id}-markupValue`, e.currentTarget);
            }}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, 'markupValue')}
            onFocus={(e) => {
              markActive(`${item.id}-markupValue`, e.currentTarget);
            }}
            onBlur={() => {
              handleFieldBlur(item.id, "markupValue");
            }}
            className="border-0 bg-transparent p-1 text-center text-sm focus:ring-1 focus:ring-blue-500 flex-1"
            data-testid={`input-markup-value-${item.id}`}
          />
          <Select
            value={getCurrentValue(item.id, 'markupType')}
            onValueChange={(value) => {
              handleFieldChange(item.id, "markupType", value);
              // Immediately save to server (unlike inputs, Select doesn't trigger blur)
              updateLineItemMutation.mutate({ 
                id: item.id, 
                data: { markupType: value },
                skipInvalidation: false
              });
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

      {/* Customer unit price - Always visible */}
      <td className="border-r border-border px-3 py-1 text-center text-sm" data-testid={`text-price-${item.id}`}>
        {formatCurrency(price)}
      </td>

      {/* Margin$ - Hidden on small screens */}
      <td className="border-r border-border px-3 py-1 text-center text-sm hidden md:table-cell" data-testid={`text-margin-${item.id}`}>
        {formatCurrency(marginAmount)}
      </td>

      {/* Total - Always visible */}
      <td className="border-r border-border px-3 py-1 text-center font-medium text-sm" data-testid={`text-total-${item.id}`}>
        {formatCurrency(total)}
      </td>

      {/* Sales tax - Always visible */}
      <td className="border-r border-border px-2 py-1 text-center">
        <div className="flex justify-center">
          <Checkbox
            aria-label={`Include ${item.description || "this line item"} in sales tax`}
            title={item.isTaxable !== false ? "Included in sales tax" : "Excluded from sales tax"}
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

      {/* Tariff - Always visible */}
      <td className="border-r border-border px-2 py-1 text-center">
        <div className="flex justify-center">
          <Checkbox
            aria-label={`Apply tariff to ${item.description || "this line item"}`}
            title={item.isTariffApplicable ? "Tariff applies to this line" : "Tariff does not apply to this line"}
            checked={!!item.isTariffApplicable}
            onCheckedChange={(checked) => {
              updateLineItemMutation.mutate({ 
                id: item.id, 
                data: { isTariffApplicable: checked === true },
                skipInvalidation: false
              });
            }}
            data-testid={`checkbox-tariff-${item.id}`}
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

export function LineItemsTable({ quoteId, lineItems, tariffRate }: LineItemsTableProps) {
  // Check if quote is new (not saved yet)
  const isUnsavedQuote = !quoteId || quoteId === 0;
  
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
  const [overId, setOverId] = useState<string | null>(null);
  
  // Product configurator state
  const [showConfiguratorDialog, setShowConfiguratorDialog] = useState(false);
  
  // Bulk margin adjustment state
  const [showBulkMarginDialog, setShowBulkMarginDialog] = useState(false);
  const [bulkMarginType, setBulkMarginType] = useState<"percentage" | "dollar">("percentage");
  const [bulkMarginValue, setBulkMarginValue] = useState("");
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  
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
  
  // Local state for immediate edit feedback - these are "draft" values that are
  // completely independent from server data while being edited
  const [localValues, setLocalValues] = useState<Record<string, { 
    description: string; 
    quantity: string; 
    unitPrice: string; 
    markupType: string; 
    markupValue: string; 
  }>>({});
  
  // Track which rows have unsaved changes (dirty state)
  const [dirtyRows, setDirtyRows] = useState<Set<number>>(new Set());
  
  // Track which row is currently being edited (has focus)
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  
  // Track which fields are actively being edited (have focus)
  const activeInputs = useRef<Set<string>>(new Set());
  
  // Focus restoration refs to prevent focus loss during re-renders
  const activeKeyRef = useRef<string | null>(null);
  const caretRef = useRef<number | null>(null);
  
  // Validation error states
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [newItemErrors, setNewItemErrors] = useState<Record<string, string>>({});
  
  // Ref to hold the update mutation's mutate function (for use in callbacks defined before mutation)
  const updateLineItemMutateRef = useRef<((params: { id: number; data: any; skipInvalidation?: boolean }) => void) | null>(null);

  // Let in-flight save requests finish when the user leaves the page.
  useEffect(() => {
    return () => {
      pendingMutations.current = {
        create: null,
        update: {},
        delete: null,
        calculate: null,
      };
    };
  }, []);

  // Initialize local values when lineItems change
  // Only update rows that are NOT dirty (have unsaved changes) and NOT currently being edited
  useEffect(() => {
    setLocalValues(prev => {
      const newLocalValues: Record<string, { 
        description: string; 
        quantity: string; 
        unitPrice: string; 
        markupType: string; 
        markupValue: string; 
      }> = { ...prev };
      
      lineItems.forEach(item => {
        // Skip updating rows that are dirty or being edited - preserve their local draft state
        if (dirtyRows.has(item.id) || editingRowId === item.id) {
          return;
        }
        
        newLocalValues[item.id] = {
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          markupType: item.markupType,
          markupValue: item.markupValue.toString()
        };
      });
      
      return newLocalValues;
    });
  }, [lineItems, dirtyRows, editingRowId]);

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
    
    // Extract item ID from key (format: "itemId-fieldName")
    const itemId = parseInt(key.split('-')[0]);
    if (!isNaN(itemId)) {
      setEditingRowId(itemId);
    }
    
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

  const { data: sundancePricingDefault } = useQuery<PricingDefaultResponse>({
    queryKey: ["/api/pricing-defaults/sundance"],
    queryFn: async ({ signal }) => {
      const response = await apiRequest("GET", "/api/pricing-defaults/sundance", undefined, { signal });
      return response.json();
    },
  });

  const productIdsWithColors = useMemo(() => {
    const ids = new Set<number>();
    for (const item of lineItems) {
      if (item.productId) {
        try {
          const cd = item.configData ? (typeof item.configData === 'string' ? JSON.parse(item.configData) : item.configData) : null;
          if (cd?.colors && Array.isArray(cd.colors) && cd.colors.length > 0) {
            ids.add(item.productId);
          }
        } catch {}
      }
    }
    return Array.from(ids);
  }, [lineItems]);

  const { data: productColorsMap } = useQuery<Record<number, (ProductColor & { color: Color })[]>>({
    queryKey: ['/api/product-colors', 'inline', productIdsWithColors.join(',')],
    queryFn: async () => {
      if (productIdsWithColors.length === 0) return {};
      const response = await apiRequest('GET', `/api/products/colors/batch?productIds=${productIdsWithColors.join(',')}`);
      return response.json();
    },
    enabled: productIdsWithColors.length > 0,
    staleTime: 300_000,
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

  // Immediate local update - NO auto-save on keystroke
  // Saves only happen on blur or explicit commit to prevent cursor jumping
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
    
    // Mark this row as dirty (has unsaved changes)
    setDirtyRows(prev => new Set(prev).add(itemId));
    
    // Track which row is being edited
    setEditingRowId(itemId);
    
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
        validationError = "EDG cost is required";
      } else if (isNaN(num) || num < 0) {
        validationError = "EDG cost must be a valid positive number";
      } else if (num > 10000000) {
        validationError = "EDG cost must be less than $10,000,000";
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
    
    // NO debounced auto-save - saving happens only on blur
  }, []);
  
  // Save entire row on blur - this is the ONLY place where saves happen
  // This eliminates cursor jumping by avoiding saves while typing
  const handleFieldBlur = useCallback((itemId: number, field: 'description' | 'quantity' | 'unitPrice' | 'markupType' | 'markupValue') => {
    const key = `${itemId}-${field}`;
    
    // Remove from active inputs
    activeInputs.current.delete(key);
    
    // Use a small delay to check if we're moving to another field in the same row
    // This prevents saving on every field change within the same row
    setTimeout(() => {
      // Check if another field in this row is now active
      const stillEditingRow = Array.from(activeInputs.current).some(activeKey => 
        activeKey.startsWith(`${itemId}-`)
      );
      
      if (stillEditingRow) {
        // Still editing the same row, don't save yet
        return;
      }
      
      // No longer editing this row - check if it's dirty and needs saving
      if (!dirtyRows.has(itemId)) {
        // Not dirty, nothing to save
        activeKeyRef.current = null;
        if (editingRowId === itemId) {
          setEditingRowId(null);
        }
        return;
      }
      
      // Check for validation errors in this row
      const rowHasErrors = Object.keys(validationErrors).some(errorKey => 
        errorKey.startsWith(`${itemId}-`)
      );
      
      if (rowHasErrors) {
        // Has validation errors - revert to server values
        const item = lineItems.find(i => i.id === itemId);
        if (item) {
          setLocalValues(prev => ({
            ...prev,
            [itemId]: {
              description: item.description,
              quantity: item.quantity.toString(),
              unitPrice: item.unitPrice.toString(),
              markupType: item.markupType,
              markupValue: item.markupValue.toString()
            }
          }));
          // Clear validation errors for this row
          setValidationErrors(prev => {
            const newErrors = { ...prev };
            Object.keys(newErrors).forEach(k => {
              if (k.startsWith(`${itemId}-`)) {
                delete newErrors[k];
              }
            });
            return newErrors;
          });
        }
        // Clear dirty state
        setDirtyRows(prev => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
        if (editingRowId === itemId) {
          setEditingRowId(null);
        }
        activeKeyRef.current = null;
        return;
      }
      
      // Get the current local values for this row
      const rowValues = localValues[itemId];
      if (!rowValues) {
        activeKeyRef.current = null;
        return;
      }
      
      // Prepare the complete update data for the entire row
      const updateData: Record<string, any> = {};
      
      // Description
      if (rowValues.description) {
        updateData.description = rowValues.description;
      }
      
      // Quantity
      const quantitySanitized = sanitizeNumberString(rowValues.quantity);
      const quantityParsed = parseFloat(quantitySanitized);
      if (!isNaN(quantityParsed) && quantityParsed > 0) {
        updateData.quantity = quantityParsed;
      }
      
      // EDG Cost
      const priceSanitized = sanitizeNumberString(rowValues.unitPrice);
      const priceParsed = parseFloat(priceSanitized);
      if (!isNaN(priceParsed)) {
        updateData.unitPrice = priceParsed;
      }
      
      // Markup Type
      if (rowValues.markupType === 'percentage' || rowValues.markupType === 'dollar') {
        updateData.markupType = rowValues.markupType;
      }
      
      // Markup Value
      const markupSanitized = sanitizeNumberString(rowValues.markupValue);
      const markupParsed = parseFloat(markupSanitized);
      if (!isNaN(markupParsed)) {
        updateData.markupValue = markupParsed;
      }
      
      // Only save if we have data to update
      if (Object.keys(updateData).length > 0) {
        try {
          updateLineItemMutateRef.current?.({ id: itemId, data: updateData });
        } catch (error) {
          const err = error as Error;
          if (err?.name !== 'AbortError' && !err?.message?.includes('aborted') && !err?.message?.includes('signal is aborted')) {
            console.error('Error saving on blur:', error);
          }
        }
      }
      
      // Clear dirty state after initiating save
      setDirtyRows(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      
      if (editingRowId === itemId) {
        setEditingRowId(null);
      }
      activeKeyRef.current = null;
    }, 50); // Small delay to check if moving to another field in the same row
  }, [localValues, validationErrors, lineItems, dirtyRows, editingRowId]);
  
  // Keyboard navigation helper - Enter commits the row and moves to next
  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, column: 'description' | 'quantity' | 'unitPrice' | 'markupValue') => {
    const totalRows = lineItems.length;
    const currentItemId = lineItems[rowIndex]?.id;
    
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // First, blur the current field to trigger save
      (e.currentTarget as HTMLInputElement)?.blur();
      
      // Then navigate to next/previous row after a short delay
      setTimeout(() => {
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
      }, 100); // Small delay to let blur handler run first
    } else if (e.key === 'Tab') {
      // Allow default Tab behavior for horizontal navigation
      return;
    } else if (e.key === 'Escape') {
      // Revert changes and blur
      e.preventDefault();
      const item = lineItems.find(i => i.id === currentItemId);
      if (item && currentItemId) {
        // Revert to server values
        setLocalValues(prev => ({
          ...prev,
          [currentItemId]: {
            description: item.description,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toString(),
            markupType: item.markupType,
            markupValue: item.markupValue.toString()
          }
        }));
        // Clear dirty state
        setDirtyRows(prev => {
          const next = new Set(prev);
          next.delete(currentItemId);
          return next;
        });
        // Clear validation errors for this row
        setValidationErrors(prev => {
          const newErrors = { ...prev };
          Object.keys(newErrors).forEach(k => {
            if (k.startsWith(`${currentItemId}-`)) {
              delete newErrors[k];
            }
          });
          return newErrors;
        });
        // Clear editing row
        setEditingRowId(null);
      }
      (e.currentTarget as HTMLInputElement)?.blur();
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
      const errorMessage = error?.message || "Failed to add line item";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  const updateLineItemMutation = useMutation({
    mutationFn: async ({ id, data, skipInvalidation }: { id: number; data: any; skipInvalidation?: boolean }) => {
      try {
        const response = await apiRequest("PUT", `/api/line-items/${id}`, data, {
          signal: abortController.current.signal
        });
        const body = await response.json();
        return { ...body, skipInvalidation };
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
    onSuccess: (result, { id, data }) => {
      // Check if this was an aborted mutation
      if (result?.__aborted) {
        return;
      }
      
      // Clear the pending mutation reference
      const updateKey = `update-${id}`;
      delete pendingMutations.current.update[updateKey];
      
      // Update local values with server response to keep them in sync
      // This prevents stale local values from persisting after server confirms the update
      setLocalValues(prev => {
        const updated = { ...prev };
        if (updated[id]) {
          // Update with values from server response (result contains the updated line item)
          if (result.description !== undefined) updated[id].description = result.description;
          if (result.quantity !== undefined) updated[id].quantity = result.quantity.toString();
          if (result.unitPrice !== undefined) updated[id].unitPrice = result.unitPrice.toString();
          if (result.markupType !== undefined) updated[id].markupType = result.markupType;
          if (result.markupValue !== undefined) updated[id].markupValue = result.markupValue.toString();
        }
        return updated;
      });
      
      // Use optimistic update: directly update the cache instead of refetching
      // This prevents re-renders that could cause cursor jumping
      if (result.skipInvalidation !== true) {
        // Verify the result is a valid line item (has required fields)
        // This guards against malformed API responses
        const isValidLineItem = result && 
          typeof result.id === 'number' &&
          typeof result.description === 'string' &&
          result.quantity !== undefined;
        
        if (isValidLineItem) {
          // Optimistically update the quote's lineItems in the cache
          queryClient.setQueryData([`/api/quotes/${quoteId}`], (oldQuote: any) => {
            if (!oldQuote || !oldQuote.lineItems) return oldQuote;
            return {
              ...oldQuote,
              lineItems: oldQuote.lineItems.map((item: any) => 
                item.id === id ? { ...item, ...result } : item
              )
            };
          });
          
          // Also update the quotes list cache optimistically
          queryClient.setQueryData(["/api/quotes"], (old: any) => {
            if (!old) return old;
            return old.map((q: any) => {
              if (q.id !== quoteId || !q.lineItems) return q;
              return {
                ...q,
                lineItems: q.lineItems.map((item: any) => 
                  item.id === id ? { ...item, ...result } : item
                )
              };
            });
          });
        } else {
          // Fallback: invalidate cache if response is malformed
          queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
        }
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
      
      // Rollback local state to the server's last known value
      const item = lineItems.find(i => i.id === variables.id);
      if (item) {
        setLocalValues(prev => ({
          ...prev,
          [variables.id]: {
            description: item.description,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toString(),
            markupType: item.markupType,
            markupValue: item.markupValue.toString()
          }
        }));
      }
      
      const errorMessage = error?.message || "Failed to update line item";
      toast({ title: "Error", description: `${errorMessage}. Changes have been reverted.`, variant: "destructive" });
    },
  });
  
  // Assign the mutate function to the ref for use in callbacks defined before this mutation
  updateLineItemMutateRef.current = updateLineItemMutation.mutate;

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
        setNewItem((currentItem) => ({
          ...currentItem,
          description: selectedConfigurableProduct.name,
          unitPrice: data.price.toString(),
        }));
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

  // Bulk margin update handler
  const handleBulkMarginUpdate = async () => {
    // Validate input
    const value = parseFloat(bulkMarginValue);
    if (isNaN(value) || !Number.isFinite(value)) {
      toast({ 
        title: "Invalid value", 
        description: "Please enter a valid number", 
        variant: "destructive" 
      });
      return;
    }

    // Validate range based on type
    if (bulkMarginType === "percentage") {
      if (value < 0 || value > 1000) {
        toast({ 
          title: "Invalid percentage", 
          description: "Percentage must be between 0 and 1000", 
          variant: "destructive" 
        });
        return;
      }
    } else {
      if (value < -10000000 || value > 10000000) {
        toast({ 
          title: "Invalid amount", 
          description: "Dollar amount must be between -10,000,000 and 10,000,000", 
          variant: "destructive" 
        });
        return;
      }
    }

    // Check if there are any line items
    if (lineItems.length === 0) {
      toast({ 
        title: "No items", 
        description: "There are no line items to update", 
        variant: "destructive" 
      });
      return;
    }

    // Check for unsaved edits using the dirty rows state
    const hasPendingEdits = dirtyRows.size > 0 || activeInputs.current.size > 0;
    if (hasPendingEdits) {
      // Clear any pending state to avoid race conditions
      activeInputs.current.clear();
      setDirtyRows(new Set());
      setEditingRowId(null);
    }

    setIsBulkUpdating(true);

    try {
      const ids = lineItems.map(item => item.id);
      const roundedValue = Math.round(value * 100) / 100; // Round to 2 decimal places
      
      const response = await apiRequest("PUT", "/api/line-items/bulk", {
        ids,
        updates: {
          markupType: bulkMarginType,
          markupValue: roundedValue.toString()
        }
      }, {
        signal: abortController.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to update margins" }));
        throw new Error(errorData.message || "Failed to update margins");
      }

      const result = await response.json();
      const updatedCount = result?.updatedCount ?? ids.length;

      // Update local values to reflect the change immediately
      setLocalValues(prev => {
        const updated = { ...prev };
        for (const id of ids) {
          if (updated[id]) {
            updated[id].markupType = bulkMarginType;
            updated[id].markupValue = roundedValue.toString();
          }
        }
        return updated;
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      
      // Also update the list cache
      queryClient.fetchQuery({ queryKey: [`/api/quotes/${quoteId}`] }).then((updatedQuote) => {
        queryClient.setQueryData(["/api/quotes"], (old: any) => {
          if (!old) return old;
          return old.map((q: any) => q.id === quoteId ? updatedQuote : q);
        });
      });

      toast({ 
        title: "Margins updated", 
        description: `Updated ${updatedCount} line item${updatedCount !== 1 ? 's' : ''} to ${roundedValue}${bulkMarginType === 'percentage' ? '%' : ' dollar'} margin` 
      });

      // Close dialog and reset
      setShowBulkMarginDialog(false);
      setBulkMarginValue("");
    } catch (error: any) {
      if (error instanceof NavigationAbortError || error?.name === 'AbortError') {
        return;
      }
      toast({ 
        title: "Error", 
        description: error?.message || "Failed to update margins", 
        variant: "destructive" 
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };

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
      errors.unitPrice = "EDG cost must be a valid positive number";
    }
    
    const markupValue = parseFloat(newItem.markupValue || "0");
    if (isNaN(markupValue)) {
      errors.markupValue = "Markup value must be a valid number";
    } else if (markupValue < 0) {
      errors.markupValue = "Markup value cannot be negative";
    }
    
    const discountValue = parseFloat(newItem.discountValue || "0");
    if (isNaN(discountValue) || discountValue < 0) {
      errors.discountValue = "Discount value cannot be negative";
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
    const isSundanceProduct = product.manufacturer?.trim().toLowerCase() === "sundance";
    const defaultMarkupValue = isSundanceProduct
      ? (sundancePricingDefault?.markupValue ? parseFloat(sundancePricingDefault.markupValue).toString() : "100")
      : "0";

    if (product.productType === "configurable") {
      setNewItem((currentItem) => ({
        ...currentItem,
        markupType: "percentage",
        markupValue: defaultMarkupValue,
      }));
      setSelectedConfigurableProduct(product);
      setShowProductDialog(false);
      setShowDimensionDialog(true);
    } else {
      const pricing = getProductPricingBreakdown(product);
      const calculatedUnitPrice = pricing.edgCost.toFixed(2);
      
      setNewItem((currentItem) => ({
        ...currentItem,
        description: product.name,
        retailPrice: product.retailPrice?.toString() || "",
        unitPrice: calculatedUnitPrice,
        discountType: "percentage", // Reset - supplier discount is already included in EDG cost
        discountValue: "0", // Reset - unitPrice stores the EDG cost basis
        markupType: "percentage",
        markupValue: defaultMarkupValue,
      }));
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
    setOverId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverId(over?.id as string | null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

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
    } else if (overId === 'ungrouped' || overId === 'ungrouped-dropzone') {
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

    // Clear any pending edit state to prevent race conditions
    activeInputs.current.clear();
    setDirtyRows(new Set());
    setEditingRowId(null);

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
        (product.sku || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const productManufacturer = product.manufacturer || "Unknown";
      const matchesManufacturer = selectedManufacturer === "all" || 
        productManufacturer === selectedManufacturer;
      
      return matchesSearch && matchesManufacturer;
    });
  }, [products, searchTerm, selectedManufacturer]);

  const groupedProducts = useMemo(() => {
    return filteredProducts.reduce((groups, product) => {
      const category = product.category || "Uncategorized";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(product);
      return groups;
    }, {} as Record<string, Product[]>);
  }, [filteredProducts]);

  return (
    <div className="mb-6">
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Line Items
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Build the quote from catalog products first, then use custom items for anything special.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
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
            <Dialog open={showBulkMarginDialog} onOpenChange={(open) => {
              setShowBulkMarginDialog(open);
              if (!open) {
                setBulkMarginValue("");
              }
            }}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUnsavedQuote || lineItems.length === 0}
                  data-testid="button-bulk-margin"
                >
                  <Percent className="mr-2 h-4 w-4" />
                  Bulk Margin
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Adjust Margins for All Line Items</DialogTitle>
                  <DialogDescription>
                    This will override the margin on all {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''} in this quote.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-sm font-medium mb-2 block">Margin Value</label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={bulkMarginType === 'percentage' ? 'e.g., 25' : 'e.g., 50.00'}
                        value={bulkMarginValue}
                        onChange={(e) => setBulkMarginValue(e.target.value)}
                        className="w-full"
                        data-testid="input-bulk-margin-value"
                      />
                    </div>
                    <div className="w-32">
                      <label className="text-sm font-medium mb-2 block">Type</label>
                      <Select 
                        value={bulkMarginType} 
                        onValueChange={(value: "percentage" | "dollar") => setBulkMarginType(value)}
                      >
                        <SelectTrigger data-testid="select-bulk-margin-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">%</SelectItem>
                          <SelectItem value="dollar">$</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {bulkMarginType === 'percentage' 
                      ? 'Enter a percentage markup (e.g., 25 for 25% markup on EDG cost)'
                      : 'Enter a fixed dollar amount to add to each item\'s cost'}
                  </p>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowBulkMarginDialog(false)}
                      disabled={isBulkUpdating}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleBulkMarginUpdate}
                      disabled={isBulkUpdating || !bulkMarginValue}
                      data-testid="button-apply-bulk-margin"
                    >
                      {isBulkUpdating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        'Apply to All Items'
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-sm"
                  disabled={isUnsavedQuote}
                >
                  <Package className="mr-2 h-4 w-4" />
                  Add From Catalog
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>Select Product from Catalog</DialogTitle>
                  <DialogDescription>
                    Browse and search products to add to your quote
                  </DialogDescription>
                </DialogHeader>
                
                <div className="flex flex-col h-full max-h-[70vh]">
                  {/* Search and Filter Controls */}
                  <div className="flex flex-col gap-3 mb-4 p-1 sm:flex-row">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        placeholder="Search products..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                        data-testid="input-product-search"
                      />
                    </div>
                    
                    <Select value={selectedManufacturer} onValueChange={setSelectedManufacturer}>
                      <SelectTrigger className="w-full sm:w-48" data-testid="select-manufacturer-filter">
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
                      <div className="p-8 text-center text-muted-foreground">
                        No products found matching your criteria.
                      </div>
                    ) : (
                      Object.entries(groupedProducts).map(([category, products]) => (
                        <div key={category} className="border-b border-border last:border-b-0">
                          <div className="bg-muted px-4 py-2 font-medium text-sm text-foreground border-b border-border">
                            {category} ({products.length})
                          </div>
                          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {products.map((product) => (
                              <div
                                key={product.id}
                                onClick={() => handleProductSelect(product)}
                                className="p-3 border border-border rounded hover:bg-primary/10 hover:border-blue-300 cursor-pointer transition-colors"
                                data-testid={`product-card-${product.id}`}
                              >
                                <div className="mb-1 flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-sm text-foreground">
                                    {product.name}
                                  </span>
                                  {product.sku && (
                                    <Badge variant="outline" className="text-[10px]">
                                      {product.sku}
                                    </Badge>
                                  )}
                                </div>
                                {product.description && (
                                  <div className="text-xs text-muted-foreground mb-2 line-clamp-2">
                                    {product.description}
                                  </div>
                                )}
                                <div className="flex justify-between items-center">
                                  <div className="text-xs text-muted-foreground">EDG Cost</div>
                                  <div className="text-sm font-medium text-green-600">
                                    {formatCurrency(getProductPricingBreakdown(product).edgCost)}
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
              onClick={() => setShowConfiguratorDialog(true)}
              variant="outline"
              className="text-sm"
              disabled={isUnsavedQuote}
              data-testid="button-configure-product"
            >
              <Settings className="mr-2 h-4 w-4" />
              Sundance Builder
            </Button>
            <Button
              onClick={() => setShowNewItemForm(true)}
              className="bg-edg-black hover:bg-edg-grey text-white text-sm"
              disabled={isUnsavedQuote}
            >
              <Plus className="mr-2 h-4 w-4" />
              Custom Item
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card">
        {/* Alert message for unsaved quotes */}
        {isUnsavedQuote && (
          <div className="p-4 border-b border-border bg-primary/10">
            <div className="text-blue-800 text-sm">
              <strong>Save the quote first</strong> - You need to save the quote before you can add line items.
            </div>
          </div>
        )}
        
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-x-auto">
            <table className="w-full border border-border divide-y divide-gray-300">
              <colgroup>
                <col style={{width: '40px'}} /><col style={{width: '26%'}} /><col style={{width: '80px'}} /><col style={{width: '100px'}} /><col style={{width: '160px'}} /><col style={{width: '120px'}} /><col style={{width: '100px'}} /><col style={{width: '140px'}} /><col style={{width: '90px'}} /><col style={{width: '80px'}} /><col style={{width: '80px'}} />
              </colgroup>
              <thead>
                <tr className="bg-muted">
                  <th className="border-r border-border px-2 py-2 text-center text-sm font-medium text-foreground w-8">
                    <GripVertical className="h-4 w-4 mx-auto" />
                  </th>
                  <th className="border-r border-border px-3 py-2 text-left text-sm font-medium text-foreground">
                    Description
                  </th>
                  <th className="border-r border-border px-3 py-2 text-center text-sm font-medium text-foreground">
                    QTY
                  </th>
                  <th className="border-r border-border px-3 py-2 text-center text-sm font-medium text-foreground hidden lg:table-cell">
                    <span className="inline-flex items-center justify-center gap-1.5">
                      Cost
                      <HeaderHelp label="Explain cost column">
                        EDG's internal cost before customer markup.
                      </HeaderHelp>
                    </span>
                  </th>
                  <th className="border-r border-border px-3 py-2 text-center text-sm font-medium text-foreground hidden lg:table-cell">
                    <span className="inline-flex items-center justify-center gap-1.5">
                      Markup
                      <HeaderHelp label="Explain markup column">
                        Adds EDG margin to the customer unit price.
                      </HeaderHelp>
                    </span>
                  </th>
                  <th className="border-r border-border px-3 py-2 text-center text-sm font-medium text-foreground">
                    <span className="inline-flex items-center justify-center gap-1.5">
                      Customer Unit
                      <HeaderHelp label="Explain customer unit column">
                        Customer-facing price per unit after markup.
                      </HeaderHelp>
                    </span>
                  </th>
                  <th className="border-r border-border px-3 py-2 text-center text-sm font-medium text-foreground hidden md:table-cell">
                    <span className="inline-flex items-center justify-center gap-1.5">
                      Margin$
                      <HeaderHelp label="Explain margin column">
                        Estimated EDG profit for this row. Tariff is treated as pass-through and not counted as margin.
                      </HeaderHelp>
                    </span>
                  </th>
                  <th className="border-r border-border px-3 py-2 text-center text-sm font-medium text-foreground">
                    Total
                  </th>
                  <th className="border-r border-border px-2 py-2 text-center text-sm font-medium text-foreground">
                    <span className="inline-flex items-center justify-center gap-1.5">
                      Sales Tax
                      <HeaderHelp label="Explain sales tax line checkbox">
                        Checked rows are included in sales-tax math. Uncheck labor or any row that should not be taxed.
                      </HeaderHelp>
                    </span>
                  </th>
                  <th className="border-r border-border px-2 py-2 text-center text-sm font-medium text-foreground">
                    <span className="inline-flex items-center justify-center gap-1.5">
                      Tariff
                      <HeaderHelp label="Explain tariff line checkbox">
                        Checked rows receive the quote's tariff rate as a pass-through cost.
                      </HeaderHelp>
                    </span>
                  </th>
                  <th className="px-3 py-2 text-center text-sm font-medium text-foreground">
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
                      isDropTarget={overId === 'ungrouped' && activeId !== null && !activeId.startsWith('group-')}
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
                          getCurrentValue={getCurrentValue}
                          handleFieldChange={handleFieldChange}
                          markActive={markActive}
                          handleKeyDown={handleKeyDown}
                          handleFieldBlur={handleFieldBlur}
                          validationErrors={validationErrors}
                          tariffRate={tariffRate}
                          updateLineItemMutation={updateLineItemMutation}
                          deleteLineItemMutation={deleteLineItemMutation}
                          formatCurrency={formatCurrency}
                          calculateLineItemMargin={calculateLineItemMargin}
                          calculateLineItemTotal={calculateLineItemTotal}
                          availableColors={item.productId ? productColorsMap?.[item.productId] : undefined}
                        />
                      ))}
                    </SortableContext>
                  </>
                )}

                {/* Render groups */}
                {sortedGroups.map((group) => {
                  const groupItems = groupedLineItems.grouped[group.id] || [];
                  
                  return (
                    <React.Fragment key={group.id}>
                      <GroupHeader
                        group={group}
                        lineItems={groupItems}
                        onToggleCollapse={handleToggleGroupCollapse}
                        onEditTitle={handleEditGroupTitle}
                        onDeleteGroup={handleDeleteGroup}
                        isEditing={editingGroupId === group.id}
                        onStartEdit={() => setEditingGroupId(group.id)}
                        onCancelEdit={() => setEditingGroupId(null)}
                        isDropTarget={overId === `group-${group.id}` && activeId !== null && !activeId.startsWith('group-')}
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
                              getCurrentValue={getCurrentValue}
                              handleFieldChange={handleFieldChange}
                              markActive={markActive}
                              handleKeyDown={handleKeyDown}
                              handleFieldBlur={handleFieldBlur}
                              validationErrors={validationErrors}
                              tariffRate={tariffRate}
                              updateLineItemMutation={updateLineItemMutation}
                              deleteLineItemMutation={deleteLineItemMutation}
                              formatCurrency={formatCurrency}
                              calculateLineItemMargin={calculateLineItemMargin}
                              calculateLineItemTotal={calculateLineItemTotal}
                              availableColors={item.productId ? productColorsMap?.[item.productId] : undefined}
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
                    </React.Fragment>
                  );
                })}

                {/* Show ungrouped drop zone when dragging and groups exist */}
                {activeId && !activeId.startsWith('group-') && sortedGroups.length > 0 && (
                  <UngroupedDropZone 
                    isDropTarget={overId === 'ungrouped-dropzone'}
                  />
                )}

                {/* Show message if no items at all */}
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
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
              <div className="bg-card shadow-lg border border-border rounded p-2">
                Dragging {activeId.startsWith('group-') ? 'Group' : 'Item'}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Add new item form */}
      {showNewItemForm && (
        <div className="bg-muted border-t border-border p-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1">Description</label>
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
              <label className="block text-sm font-medium text-foreground mb-1">Quantity</label>
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
              <label className="block text-sm font-medium text-foreground mb-1">EDG Cost</label>
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
              <label className="block text-sm font-medium text-foreground mb-1">Markup</label>
              <div className="flex space-x-1">
                <Input
                  value={newItem.markupValue}
                  onChange={(e) => setNewItem({ ...newItem, markupValue: e.target.value })}
                  placeholder="0"
                  type="number"
                  step="0.01"
                  min="0"
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
              <label className="block text-sm font-medium text-foreground mb-1">Line Total</label>
              <div className="bg-muted border border-border rounded px-3 py-2 text-sm text-foreground">
                {formatCurrency(
                  calculateLineItemTotal(
                    newItem.quantity,
                    newItem.unitPrice,
                    newItem.markupType,
                    newItem.markupValue,
                    newItem.discountType,
                    newItem.discountValue,
                    tariffRate,
                    false
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
            <DialogDescription>
              Specify product dimensions to calculate pricing
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
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
              <label className="block text-sm font-medium text-foreground mb-1">
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

      {/* Product Configurator */}
      <ProductConfigurator
        open={showConfiguratorDialog}
        onOpenChange={setShowConfiguratorDialog}
        quoteId={quoteId}
        onConfigInserted={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/quotes', quoteId] });
        }}
      />

    </div>
  );
}
