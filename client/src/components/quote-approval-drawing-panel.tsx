import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, PackageCheck, Plus, Save, TriangleAlert } from "lucide-react";
import type { QuoteApprovalDrawing, QuoteWithDetails } from "@shared/schema";
import {
  createDefaultApprovalDrawingData,
  formatApprovalDrawingLightLabel,
  formatApprovalDrawingSideFeatureType,
  getApprovalDrawingReadiness,
  getApprovalDrawingSideFeatures,
  inferSupportedApprovalDrawingManufacturer,
  normalizeApprovalDrawingData,
  parseApprovalDrawingLightLine,
  quoteNeedsApprovalDrawing,
  type ApprovalDrawingSide,
  type ApprovalDrawingSideFeatureType,
  type LouveredRoofApprovalDrawingData,
} from "@shared/approvalDrawing";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { QuoteApprovalDrawingPreview } from "@/components/quote-approval-drawing-preview";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type QuoteApprovalDrawingPanelProps = {
  quote: QuoteWithDetails;
  isArchivedVersion?: boolean;
};

type DrawingFormState = {
  manufacturer: string;
  productSystem: string;
  title: string;
  revisionLabel: string;
  customerNotes: string;
  internalNotes: string;
  sourceQuoteOrOrderId: string;
  sourceDocumentLabel: string;
  sourceDocumentUrl: string;
  sourcePreparedBy: string;
  sourcePreparedAt: string;
  drawingData: LouveredRoofApprovalDrawingData;
};

const sides: ApprovalDrawingSide[] = ["A", "B", "C", "D"];
const sideFeatureTypes: ApprovalDrawingSideFeatureType[] = [
  "motorized_screen",
  "sliding_privacy_wall",
  "glass_wall",
  "other",
];

function formatDateForInput(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function getInitialForm(quote: QuoteWithDetails, drawing?: QuoteApprovalDrawing): DrawingFormState {
  const inferredManufacturer = inferSupportedApprovalDrawingManufacturer(quote.lineItems || []);
  return {
    manufacturer: drawing?.manufacturer || inferredManufacturer || "",
    productSystem: drawing?.productSystem || "",
    title: drawing?.title || "Order Approval Drawing",
    revisionLabel: drawing?.revisionLabel || "",
    customerNotes: drawing?.customerNotes || "",
    internalNotes: drawing?.internalNotes || "",
    sourceQuoteOrOrderId: drawing?.sourceQuoteOrOrderId || "",
    sourceDocumentLabel: drawing?.sourceDocumentLabel || "",
    sourceDocumentUrl: drawing?.sourceDocumentUrl || "",
    sourcePreparedBy: drawing?.sourcePreparedBy || "",
    sourcePreparedAt: formatDateForInput(drawing?.sourcePreparedAt),
    drawingData: normalizeApprovalDrawingData(drawing?.drawingData),
  };
}

function statusLabel(status?: string | null) {
  switch (status) {
    case "ready_for_agreement":
      return "Ready";
    case "sent_for_signature":
      return "Sent";
    case "signed_locked":
      return "Signed Locked";
    case "revision_needed":
      return "Revision Needed";
    case "superseded":
      return "Superseded";
    default:
      return "Draft";
  }
}

function statusVariant(status?: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ready_for_agreement" || status === "signed_locked") return "default";
  if (status === "revision_needed") return "destructive";
  if (status === "sent_for_signature") return "outline";
  return "secondary";
}

function orderStatusLabel(status?: string | null) {
  switch (status) {
    case "reviewed":
      return "Reviewed";
    case "order_ready":
      return "Order Ready";
    case "override_released":
      return "Override Released";
    case "blocked":
      return "Blocked";
    default:
      return "Not Reviewed";
  }
}

export function QuoteApprovalDrawingPanel({ quote, isArchivedVersion = false }: QuoteApprovalDrawingPanelProps) {
  const drawing = quote.approvalDrawing;
  const [form, setForm] = useState<DrawingFormState>(() => getInitialForm(quote, drawing));
  const [overrideReason, setOverrideReason] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supportedManufacturer = inferSupportedApprovalDrawingManufacturer(quote.lineItems || []);
  const recommended = quoteNeedsApprovalDrawing(quote.lineItems || []);
  const isFrozen = Boolean(isArchivedVersion || drawing?.status === "sent_for_signature" || drawing?.status === "signed_locked" || drawing?.sentForSignatureAt || drawing?.signedLockedAt);
  const readiness = useMemo(() => getApprovalDrawingReadiness(form.drawingData), [form.drawingData]);

  useEffect(() => {
    setForm(getInitialForm(quote, drawing));
  }, [quote.id, drawing?.id, drawing?.updatedAt]);

  const invalidateQuote = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}/versions`] });
    queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
  };

  const buildDrawingPayload = () => ({
    manufacturer: form.manufacturer || null,
    productSystem: form.productSystem || null,
    title: form.title || "Order Approval Drawing",
    revisionLabel: form.revisionLabel || null,
    customerNotes: form.customerNotes || null,
    internalNotes: form.internalNotes || null,
    sourceQuoteOrOrderId: form.sourceQuoteOrOrderId || null,
    sourceDocumentLabel: form.sourceDocumentLabel || null,
    sourceDocumentUrl: form.sourceDocumentUrl || null,
    sourcePreparedBy: form.sourcePreparedBy || null,
    sourcePreparedAt: form.sourcePreparedAt || null,
    drawingData: form.drawingData,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = drawing
        ? `/api/quotes/${quote.id}/approval-drawing/${drawing.id}`
        : `/api/quotes/${quote.id}/approval-drawing`;
      const method = drawing ? "PATCH" : "POST";
      const response = await apiRequest(method, url, buildDrawingPayload());
      return response.json() as Promise<QuoteApprovalDrawing>;
    },
    onSuccess: () => {
      toast({ title: "Order approval drawing saved" });
      invalidateQuote();
    },
    onError: (error: any) => {
      toast({
        title: "Could not save drawing",
        description: error?.message || "Please check the drawing fields and try again.",
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/quotes/${quote.id}/approval-drawing`, {
        manufacturer: supportedManufacturer || undefined,
        title: "Order Approval Drawing",
        drawingData: createDefaultApprovalDrawingData(),
      });
      return response.json() as Promise<QuoteApprovalDrawing>;
    },
    onSuccess: () => {
      toast({ title: "Order approval drawing added" });
      invalidateQuote();
    },
    onError: (error: any) => {
      toast({
        title: "Could not add drawing",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ action, body }: { action: string; body?: Record<string, unknown> }) => {
      if (!drawing) throw new Error("No approval drawing");
      if (action === "mark-ready") {
        const saveResponse = await apiRequest(
          "PATCH",
          `/api/quotes/${quote.id}/approval-drawing/${drawing.id}`,
          buildDrawingPayload(),
        );
        await saveResponse.json();
      }
      const response = await apiRequest("POST", `/api/quotes/${quote.id}/approval-drawing/${drawing.id}/${action}`, body || {});
      return response.json() as Promise<QuoteApprovalDrawing>;
    },
    onSuccess: (_, variables) => {
      const titles: Record<string, string> = {
        "mark-ready": "Drawing marked ready",
        "revision-needed": "Drawing marked revision-needed",
        "order-reviewed": "Drawing marked reviewed",
        "order-ready": "Drawing marked order-ready",
      };
      toast({ title: titles[variables.action] || "Drawing updated" });
      setOverrideReason("");
      invalidateQuote();
    },
    onError: (error: any) => {
      toast({
        title: "Could not update drawing",
        description: error?.message || "Please review the drawing fields.",
        variant: "destructive",
      });
    },
  });

  const updateData = (updater: (data: LouveredRoofApprovalDrawingData) => LouveredRoofApprovalDrawingData) => {
    setForm((current) => ({ ...current, drawingData: updater(current.drawingData) }));
  };

  const updateLayout = (field: keyof LouveredRoofApprovalDrawingData["layout"], value: any) => {
    updateData((data) => ({ ...data, layout: { ...data.layout, [field]: value } }));
  };

  const updateSide = (side: ApprovalDrawingSide, patch: Partial<LouveredRoofApprovalDrawingData["sides"][number]>) => {
    updateData((data) => ({
      ...data,
      sides: data.sides.map((row) => row.side === side ? { ...row, ...patch } : row),
    }));
  };

  const updateSideFeature = (side: ApprovalDrawingSide, type: ApprovalDrawingSideFeatureType, checked: boolean) => {
    updateData((data) => ({
      ...data,
      sides: data.sides.map((row) => {
        if (row.side !== side) return row;

        const currentFeatures = getApprovalDrawingSideFeatures(row);
        const nextFeatures = checked
          ? currentFeatures.some((feature) => feature.type === type)
            ? currentFeatures
            : [
                ...currentFeatures,
                {
                  id: `${side}-${type}`,
                  type,
                  label: type === "other" ? "Other" : undefined,
                  span: row.enclosureSpan || row.length,
                  height: row.enclosureHeight || row.openingHeight,
                },
              ]
          : currentFeatures.filter((feature) => feature.type !== type);

        const firstFeature = nextFeatures[0];
        return {
          ...row,
          features: nextFeatures,
          enclosure: firstFeature
            ? firstFeature.type === "other"
              ? { type: "other" as const, label: firstFeature.label || "Other" }
              : { type: firstFeature.type as any }
            : { type: "none" as const },
        };
      }),
    }));
  };

  const updatePostHeight = (postId: string, value: string) => {
    updateData((data) => ({
      ...data,
      posts: data.posts.map((post) => post.id === postId ? { ...post, height: { display: value } } : post),
    }));
  };

  if (!quote.id) {
    return null;
  }

  if (!drawing) {
    return (
      <Card id="order-approval-drawing" className="mb-6 scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Order Approval Drawing</span>
            {recommended && <Badge variant="outline">Recommended for {supportedManufacturer}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert className={recommended ? "border-amber-200 bg-amber-50" : ""}>
            <TriangleAlert className="h-4 w-4 text-amber-700" />
            <AlertDescription className={recommended ? "text-amber-900" : ""}>
              Add a top-down drawing when the customer needs to approve exact pergola dimensions, colors, side enclosures, lights, and post heights before ordering.
            </AlertDescription>
          </Alert>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={isArchivedVersion || createMutation.isPending}
            data-testid="button-add-approval-drawing"
          >
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add Order Approval Drawing
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="order-approval-drawing" className="mb-6 scroll-mt-24">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-base">Order Approval Drawing</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Customer approval layout only. Not permit, engineering, or manufacturer shop drawings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={statusVariant(drawing.status)}>{statusLabel(drawing.status)}</Badge>
            <Badge variant={drawing.orderStatus === "order_ready" ? "default" : "outline"}>{orderStatusLabel(drawing.orderStatus)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {drawing.status === "revision_needed" && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-700" />
            <AlertDescription className="text-red-900">
              This drawing needs revision before it can be signed or released for ordering.
            </AlertDescription>
          </Alert>
        )}
        {isFrozen && (
          <Alert className="border-blue-200 bg-blue-50">
            <CheckCircle2 className="h-4 w-4 text-blue-700" />
            <AlertDescription className="text-blue-900">
              This drawing is frozen for signature history. Create a new quote version before editing dimensions or options.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <Label>Manufacturer</Label>
                <Select
                  value={form.manufacturer || "none"}
                  onValueChange={(value) => setForm((current) => ({ ...current, manufacturer: value === "none" ? "" : value }))}
                  disabled={isFrozen}
                >
                  <SelectTrigger data-testid="select-approval-manufacturer"><SelectValue placeholder="Manufacturer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Internal only</SelectItem>
                    <SelectItem value="Sundance">Sundance</SelectItem>
                    <SelectItem value="Brustor">Brustor</SelectItem>
                    <SelectItem value="Azenco">Azenco</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Product System</Label>
                <Input value={form.productSystem} onChange={(e) => setForm((current) => ({ ...current, productSystem: e.target.value }))} disabled={isFrozen} />
              </div>
              <div>
                <Label>Revision</Label>
                <Input value={form.revisionLabel} onChange={(e) => setForm((current) => ({ ...current, revisionLabel: e.target.value }))} placeholder="Rev A" disabled={isFrozen} />
              </div>
              <div>
                <Label>Source ID</Label>
                <Input value={form.sourceQuoteOrOrderId} onChange={(e) => setForm((current) => ({ ...current, sourceQuoteOrOrderId: e.target.value }))} disabled={isFrozen} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <Label>Length</Label>
                <Input value={form.drawingData.layout.overallLength.display} onChange={(e) => updateLayout("overallLength", { display: e.target.value })} placeholder="16 ft 0 in" disabled={isFrozen} />
              </div>
              <div>
                <Label>Projection / Depth</Label>
                <Input value={form.drawingData.layout.overallProjection.display} onChange={(e) => updateLayout("overallProjection", { display: e.target.value })} placeholder="12 ft 0 in" disabled={isFrozen} />
              </div>
              <div>
                <Label>Finished Height</Label>
                <Input value={form.drawingData.layout.finishedHeight?.display || ""} onChange={(e) => updateLayout("finishedHeight", { display: e.target.value })} placeholder="9 ft 0 in" disabled={isFrozen} />
              </div>
              <div>
                <Label>Mount Type</Label>
                <Select value={form.drawingData.layout.mountType} onValueChange={(value) => updateLayout("mountType", value)} disabled={isFrozen}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attached">Attached</SelectItem>
                    <SelectItem value="freestanding">Freestanding</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <Label>Reference Side</Label>
                <Select
                  value={form.drawingData.orientation.referenceSide}
                  onValueChange={(value) => updateData((data) => ({ ...data, orientation: { ...data.orientation, referenceSide: value as ApprovalDrawingSide } }))}
                  disabled={isFrozen}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sides.map((side) => <SelectItem key={side} value={side}>Side {side}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reference Label</Label>
                <Input value={form.drawingData.orientation.referenceSideLabel || ""} onChange={(e) => updateData((data) => ({ ...data, orientation: { ...data.orientation, referenceSideLabel: e.target.value } }))} disabled={isFrozen} />
              </div>
              <div>
                <Label>Measurement Basis</Label>
                <Input value={form.drawingData.layout.measurementBasis || ""} onChange={(e) => updateLayout("measurementBasis", e.target.value)} disabled={isFrozen} />
              </div>
              <div>
                <Label>Louver Direction</Label>
                <Select value={form.drawingData.layout.louverDirection || "unknown"} onValueChange={(value) => updateLayout("louverDirection", value)} disabled={isFrozen}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="length">Runs with length</SelectItem>
                    <SelectItem value="projection">Runs with projection</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label>Frame Color</Label>
                <Input value={form.drawingData.colors.frameColor || ""} onChange={(e) => updateData((data) => ({ ...data, colors: { ...data.colors, frameColor: e.target.value } }))} disabled={isFrozen} />
              </div>
              <div>
                <Label>Louver Color</Label>
                <Input value={form.drawingData.colors.louverColor || ""} onChange={(e) => updateData((data) => ({ ...data, colors: { ...data.colors, louverColor: e.target.value } }))} disabled={isFrozen} />
              </div>
              <div>
                <Label>Post / Trim / Gutter Color</Label>
                <Input value={form.drawingData.colors.postTrimGutterColor || ""} onChange={(e) => updateData((data) => ({ ...data, colors: { ...data.colors, postTrimGutterColor: e.target.value } }))} disabled={isFrozen} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sides / Screens / Walls</Label>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {form.drawingData.sides.map((side) => {
                  const selectedFeatureTypes = new Set(getApprovalDrawingSideFeatures(side).map((feature) => feature.type));

                  return (
                    <div key={side.side} className="rounded-md border p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge variant="outline">Side {side.side}</Badge>
                        <Input value={side.label || ""} onChange={(e) => updateSide(side.side, { label: e.target.value })} disabled={isFrozen} />
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {sideFeatureTypes.map((type) => (
                          <label key={type} className="flex min-h-9 items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                            <Checkbox
                              checked={selectedFeatureTypes.has(type)}
                              onCheckedChange={(checked) => updateSideFeature(side.side, type, checked === true)}
                              disabled={isFrozen}
                            />
                            <span>{formatApprovalDrawingSideFeatureType(type)}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Input value={side.enclosureSpan?.display || ""} onChange={(e) => updateSide(side.side, { enclosureSpan: { display: e.target.value } })} placeholder="Side feature span" disabled={isFrozen} />
                        <Input value={side.enclosureHeight?.display || ""} onChange={(e) => updateSide(side.side, { enclosureHeight: { display: e.target.value } })} placeholder="Side feature height/drop" disabled={isFrozen} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Post Heights</Label>
                <div className="grid grid-cols-2 gap-2">
                  {form.drawingData.posts.map((post) => (
                    <Input key={post.id} value={post.height?.display || ""} onChange={(e) => updatePostHeight(post.id, e.target.value)} placeholder={`${post.label} height`} disabled={isFrozen} />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Lights / Accessories</Label>
                <Textarea
                  value={form.drawingData.lights.map(formatApprovalDrawingLightLabel).join("\n")}
                  onChange={(e) => {
                    const lights = e.target.value.split("\n").filter(Boolean).map(parseApprovalDrawingLightLine);
                    updateData((data) => ({ ...data, lights }));
                  }}
                  placeholder={"1 LED strip - perimeter\nSide B - 2 spot lights"}
                  disabled={isFrozen}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <Label>Field Verified By</Label>
                <Input value={form.drawingData.approvals.fieldVerifiedBy || ""} onChange={(e) => updateData((data) => ({ ...data, approvals: { ...data.approvals, fieldVerifiedBy: e.target.value } }))} disabled={isFrozen} />
              </div>
              <div>
                <Label>Field Verified Date</Label>
                <Input type="date" value={form.drawingData.approvals.fieldVerifiedAt || ""} onChange={(e) => updateData((data) => ({ ...data, approvals: { ...data.approvals, fieldVerifiedAt: e.target.value } }))} disabled={isFrozen} />
              </div>
              <div>
                <Label>Verification Source</Label>
                <Select
                  value={form.drawingData.approvals.fieldVerifiedSource || "field_measure"}
                  onValueChange={(value) => updateData((data) => ({ ...data, approvals: { ...data.approvals, fieldVerifiedSource: value as any } }))}
                  disabled={isFrozen}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="field_measure">Field Measure</SelectItem>
                    <SelectItem value="customer_measure">Customer Measure</SelectItem>
                    <SelectItem value="manufacturer_config">Manufacturer Config</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Checkbox
                  checked={form.drawingData.approvals.noTbdValuesConfirmed === true}
                  onCheckedChange={(checked) => updateData((data) => ({ ...data, approvals: { ...data.approvals, noTbdValuesConfirmed: checked === true } }))}
                  disabled={isFrozen}
                />
                <Label className="text-sm font-normal">No TBD values</Label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Customer Notes / Exclusions</Label>
                <Textarea value={form.customerNotes} onChange={(e) => setForm((current) => ({ ...current, customerNotes: e.target.value }))} disabled={isFrozen} />
              </div>
              <div>
                <Label>Internal Order Notes</Label>
                <Textarea value={form.internalNotes} onChange={(e) => setForm((current) => ({ ...current, internalNotes: e.target.value }))} disabled={isFrozen} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <QuoteApprovalDrawingPreview drawingData={form.drawingData} />
            {!readiness.ready && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <AlertDescription className="text-amber-900">
                  Missing before ready: {readiness.missing.slice(0, 8).join(", ")}{readiness.missing.length > 8 ? "..." : ""}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap">
          <Button type="button" onClick={() => saveMutation.mutate()} disabled={isFrozen || saveMutation.isPending} data-testid="button-save-approval-drawing">
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Draft
          </Button>
          <Button type="button" variant="outline" onClick={() => actionMutation.mutate({ action: "mark-ready" })} disabled={isFrozen || !readiness.ready || actionMutation.isPending}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Mark Ready
          </Button>
          <Button type="button" variant="outline" onClick={() => actionMutation.mutate({ action: "revision-needed", body: { reason: "Staff requested revision" } })} disabled={isArchivedVersion || drawing.status === "signed_locked" || actionMutation.isPending}>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Revision Needed
          </Button>
          <Button type="button" variant="outline" onClick={() => actionMutation.mutate({ action: "order-reviewed" })} disabled={isArchivedVersion || drawing.status !== "signed_locked" || actionMutation.isPending}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Mark Reviewed
          </Button>
          <div className="flex flex-1 flex-col gap-2 sm:min-w-[260px] sm:flex-row">
            <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Override reason, if needed" disabled={isArchivedVersion || drawing.status !== "signed_locked"} />
            <Button type="button" onClick={() => actionMutation.mutate({ action: "order-ready", body: overrideReason ? { overrideReason } : {} })} disabled={isArchivedVersion || actionMutation.isPending || drawing.status !== "signed_locked" || (!readiness.ready && !overrideReason.trim())}>
              <PackageCheck className="mr-2 h-4 w-4" />
              Order Ready
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
