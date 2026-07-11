import React, { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { GripVertical, Info, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Color, LineItem, ProductColor } from "@shared/schema";

type CalculateLineItemMargin = typeof import("@/lib/utils").calculateLineItemMargin;
type CalculateLineItemTotal = typeof import("@/lib/utils").calculateLineItemTotal;

export function HeaderHelp({ label, children }: { label: string; children: React.ReactNode }) {
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
  calculateLineItemMargin: CalculateLineItemMargin;
  calculateLineItemTotal: CalculateLineItemTotal;
  availableColors?: (ProductColor & { color: Color })[];
}

export const SortableLineItemRow = memo(function SortableLineItemRow({
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
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${item.description || "line item"}`}
          className="cursor-grab hover:cursor-grabbing text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>

      {/* Description - Always visible */}
      <td className="border-r border-border px-3 py-1">
        <Input
          aria-label={`${item.description || "Line item"} description`}
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
          aria-label={`${item.description || "Line item"} quantity`}
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
            aria-label={`${item.description || "Line item"} EDG cost`}
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
            aria-label={`${item.description || "Line item"} markup value`}
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
            <SelectTrigger className="w-12 h-6 border-0 bg-transparent p-0 text-xs" aria-label={`${item.description || "Line item"} markup type`} data-testid={`select-markup-type-${item.id}`}>
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
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
              aria-label={`Delete ${item.description || "line item"}`}
              data-testid={`button-delete-${item.id}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this line item?</AlertDialogTitle>
              <AlertDialogDescription>
                {item.description || "This item"} will be removed from the quote. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteLineItemMutation.mutate(item.id)}
                className="bg-red-600 hover:bg-red-700"
                data-testid={`button-confirm-delete-${item.id}`}
              >
                Delete Item
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
});
