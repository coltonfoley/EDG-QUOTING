import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Circle, Clock, Copy, CreditCard, ExternalLink, FileCheck2, FileText, Mail, Send, ShieldCheck } from "lucide-react";
import type { PlanningAgreement, QuoteWithDetails } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCurrency } from "@/lib/utils";

const tierLabels: Record<string, string> = {
  simple_layout: "Simple Layout",
  standard_design: "Standard Design",
  complex_planning: "Complex Planning",
  custom: "Custom",
};

const paymentMethodLabels: Record<string, string> = {
  check: "Check",
  card: "Card",
  ach: "ACH",
  cash: "Cash",
  quickbooks: "QuickBooks",
  other: "Other",
};

const statusConfig: Record<string, { label: string; icon: typeof Circle; className: string }> = {
  required: { label: "Required", icon: AlertCircle, className: "border-amber-300 bg-amber-50 text-amber-900" },
  sent: { label: "Sent", icon: Send, className: "border-blue-300 bg-blue-50 text-blue-900" },
  signed_awaiting_payment: { label: "Signed, Awaiting Payment", icon: FileCheck2, className: "border-indigo-300 bg-indigo-50 text-indigo-900" },
  paid_active: { label: "Paid / Active", icon: ShieldCheck, className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  delivered: { label: "Delivered", icon: CheckCircle2, className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  credited: { label: "Credited", icon: CreditCard, className: "border-teal-300 bg-teal-50 text-teal-900" },
  waived: { label: "Waived", icon: CheckCircle2, className: "border-slate-300 bg-slate-50 text-slate-900" },
  expired: { label: "Expired", icon: Clock, className: "border-red-300 bg-red-50 text-red-900" },
  canceled: { label: "Canceled", icon: Circle, className: "border-slate-300 bg-slate-50 text-slate-900" },
};

const opsClearStatuses = new Set(["paid_active", "delivered", "credited", "waived"]);

const formatDate = (value?: string | Date | null) => {
  if (!value) return null;
  return new Date(value).toLocaleDateString();
};

const money = (value?: string | number | null) => {
  const parsed = Number(value ?? 0);
  return formatCurrency(Number.isFinite(parsed) ? parsed : 0);
};

type PlanningAgreementPanelProps = {
  quote?: QuoteWithDetails;
  isArchivedVersion?: boolean;
};

export function PlanningAgreementPanel({ quote, isArchivedVersion = false }: PlanningAgreementPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [signingLink, setSigningLink] = useState("");
  const [agreementEmailMessage, setAgreementEmailMessage] = useState("");

  const [tier, setTier] = useState("standard_design");
  const [amount, setAmount] = useState("1500.00");
  const [creditEligible, setCreditEligible] = useState(true);
  const [creditExpiresAt, setCreditExpiresAt] = useState("");
  const [scopeSummary, setScopeSummary] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("quickbooks");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [waiverReason, setWaiverReason] = useState("");
  const [creditAmount, setCreditAmount] = useState("");

  const queryKey = quote?.id ? [`/api/quotes/${quote.id}/planning-agreement`] : ["planning-agreement-disabled"];
  const { data: fetchedAgreement } = useQuery<PlanningAgreement | null>({
    queryKey,
    enabled: Boolean(quote?.id),
    initialData: quote?.planningAgreement ?? null,
  });

  const agreement = fetchedAgreement ?? quote?.planningAgreement ?? null;
  const status = agreement ? statusConfig[agreement.status] ?? statusConfig.required : null;
  const StatusIcon = status?.icon ?? Circle;
  const clearForOps = !agreement || opsClearStatuses.has(agreement.status);
  const canApplyCredit = Boolean(
    agreement &&
    agreement.creditEligible &&
    !agreement.creditedAt &&
    (agreement.paymentConfirmedAt || ["paid_active", "delivered"].includes(agreement.status))
  );
  const creditExpired = Boolean(agreement?.creditExpiresAt && new Date(agreement.creditExpiresAt) < new Date());
  const agreementSigningLink = agreement?.signingToken
    ? `${window.location.origin}/planning-agreements/sign/${agreement.signingToken}`
    : signingLink;
  const agreementSignatureAudit = agreement?.signatureAuditTrail as { documentFingerprint?: string } | null | undefined;

  const invalidatePlanningData = () => {
    if (!quote?.id) return;
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quote.id}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
    if (quote.accountId) {
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${quote.accountId}/details`] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${quote.accountId}/planning-agreements`] });
    }
  };

  const actionMutation = useMutation({
    mutationFn: async ({ path, body, method = "POST" }: { path: string; body?: Record<string, unknown>; method?: "POST" | "PATCH" }) => {
      const response = await apiRequest(method, path, body ?? {});
      return response.json() as Promise<PlanningAgreement>;
    },
    onSuccess: () => {
      invalidatePlanningData();
      toast({ title: "Design + Planning updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Planning update failed", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!quote?.id) throw new Error("Create the quote before requiring a planning agreement.");
      const response = await apiRequest("POST", `/api/quotes/${quote.id}/planning-agreement`, {
        tier,
        amount,
        creditEligible,
        creditExpiresAt: creditExpiresAt || null,
        scopeSummary: scopeSummary || null,
        internalNotes: internalNotes || null,
      });
      return response.json() as Promise<PlanningAgreement>;
    },
    onSuccess: (created) => {
      setCreateOpen(false);
      setCreditAmount(created.amount?.toString() || amount);
      invalidatePlanningData();
      toast({ title: "Design + Planning Agreement required" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not require planning agreement", description: error.message, variant: "destructive" });
    },
  });

  const prepareSigningMutation = useMutation({
    mutationFn: async () => {
      if (!agreement) throw new Error("No planning agreement selected.");
      const response = await apiRequest("POST", `/api/planning-agreements/${agreement.id}/prepare-signing`, {});
      return response.json() as Promise<{
        agreement: PlanningAgreement;
        signingToken: string;
        signingUrl: string;
        absoluteSigningUrl?: string;
      }>;
    },
    onSuccess: (data) => {
      setSigningLink(data.absoluteSigningUrl || `${window.location.origin}${data.signingUrl}`);
      setAgreementEmailMessage(data.agreement.signatureEmailMessage || agreement?.signatureEmailMessage || "");
      setSendOpen(true);
      invalidatePlanningData();
      toast({ title: "Agreement link ready" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not prepare agreement link", description: error.message, variant: "destructive" });
    },
  });

  const sendAgreementEmailMutation = useMutation({
    mutationFn: async () => {
      if (!agreement) throw new Error("No planning agreement selected.");
      const response = await apiRequest("POST", `/api/planning-agreements/${agreement.id}/send-signature-email`, {
        message: agreementEmailMessage || "",
      });
      return response.json() as Promise<{
        agreement: PlanningAgreement;
        signingToken: string;
        signingUrl: string;
        absoluteSigningUrl?: string;
        message?: string;
      }>;
    },
    onSuccess: (data) => {
      setSigningLink(data.absoluteSigningUrl || `${window.location.origin}${data.signingUrl}`);
      invalidatePlanningData();
      toast({
        title: "Agreement email sent",
        description: data.message || "Design + Planning Agreement sent to customer.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not send agreement email", description: error.message, variant: "destructive" });
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!agreement) throw new Error("No planning agreement selected.");
      const response = await apiRequest("POST", `/api/planning-agreements/${agreement.id}/confirm-payment`, {
        verified: paymentVerified,
        amount: amount || agreement.amount,
        paymentMethod,
        paymentReference: paymentReference || null,
        paymentNotes: paymentNotes || null,
      });
      return response.json() as Promise<PlanningAgreement>;
    },
    onSuccess: () => {
      setPaymentOpen(false);
      setPaymentVerified(false);
      invalidatePlanningData();
      toast({ title: "Planning payment confirmed" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not confirm payment", description: error.message, variant: "destructive" });
    },
  });

  const waiveMutation = useMutation({
    mutationFn: async () => {
      if (!agreement) throw new Error("No planning agreement selected.");
      const response = await apiRequest("POST", `/api/planning-agreements/${agreement.id}/waive`, {
        waiverReason,
      });
      return response.json() as Promise<PlanningAgreement>;
    },
    onSuccess: () => {
      setWaiveOpen(false);
      setWaiverReason("");
      invalidatePlanningData();
      toast({ title: "Planning agreement waived" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not waive agreement", description: error.message, variant: "destructive" });
    },
  });

  const applyCreditMutation = useMutation({
    mutationFn: async () => {
      if (!agreement || !quote?.id) throw new Error("No planning agreement selected.");
      const response = await apiRequest("POST", `/api/planning-agreements/${agreement.id}/apply-credit`, {
        quoteId: quote.id,
        amount: creditAmount || agreement.amount,
      });
      return response.json() as Promise<PlanningAgreement>;
    },
    onSuccess: () => {
      setCreditOpen(false);
      invalidatePlanningData();
      toast({ title: "Planning credit applied" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not apply credit", description: error.message, variant: "destructive" });
    },
  });

  const nextAction = useMemo(() => {
    if (!quote?.id) return "Create the quote before requiring a planning agreement.";
    if (!agreement) return "Optional: require paid design work only when this job needs it.";
    if (agreement.status === "required") return "Send the agreement for customer signature or waive it before detailed design work.";
    if (agreement.status === "sent") return "Waiting on customer signature. Payment is still confirmed manually after it is verified.";
    if (agreement.status === "signed_awaiting_payment") return "Manually confirm payment after it is verified outside Rainmaker.";
    if (agreement.status === "paid_active") return "Planning work is active. Mark delivered or apply credit when ready.";
    if (agreement.status === "delivered") return "Planning work is delivered. Apply the credit if it should count toward the project.";
    if (agreement.status === "credited") return "Planning fee has been credited to this quote family.";
    if (agreement.status === "waived") return "Planning fee was waived; normal quote workflow can continue.";
    return "Review this planning agreement before moving the job forward.";
  }, [agreement, quote?.id]);

  const openSigningDialog = () => {
    if (!agreement) return;
    setAgreementEmailMessage(agreement.signatureEmailMessage || "");
    if (agreement.signingToken) {
      setSigningLink(`${window.location.origin}/planning-agreements/sign/${agreement.signingToken}`);
      setSendOpen(true);
      return;
    }
    prepareSigningMutation.mutate();
  };

  const copySigningLink = async () => {
    const link = agreementSigningLink || signingLink;
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast({ title: "Copied", description: "Agreement signing link copied to clipboard." });
  };

  return (
    <div className="mt-4 rounded-md border bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">Design + Planning</p>
            {agreement ? (
              <Badge variant="outline" className={cn("gap-1.5", status?.className)}>
                <StatusIcon className="h-3.5 w-3.5" />
                {status?.label}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground">
                Not required
              </Badge>
            )}
            {!clearForOps && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                Ops gated
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{nextAction}</p>
          {agreement && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{tierLabels[agreement.tier] ?? agreement.tier}</span>
              <span>{money(agreement.amount)}</span>
              {agreement.signatureEmailSentAt && <span>Email sent {formatDate(agreement.signatureEmailSentAt)}</span>}
              {agreement.customerSignedAt && <span>Signed {formatDate(agreement.customerSignedAt)}</span>}
              {agreement.paymentConfirmedAt && <span>Paid {formatDate(agreement.paymentConfirmedAt)}</span>}
              {agreement.creditEligible && <span>Credit eligible{agreement.creditExpiresAt ? ` until ${formatDate(agreement.creditExpiresAt)}` : ""}</span>}
              {agreement.creditedAt && <span>Credit applied: {money(agreement.appliedCreditAmount)}</span>}
              {agreementSignatureAudit?.documentFingerprint && <span>Doc ID {agreementSignatureAudit.documentFingerprint.slice(0, 12)}</span>}
              {creditExpired && <span className="text-red-700">Credit expired</span>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!agreement ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={!quote?.id || isArchivedVersion}>
                  <FileText className="mr-2 h-4 w-4" />
                  Require Agreement
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Require Design + Planning Agreement</DialogTitle>
                  <DialogDescription>
                    Use this only when the job needs paid custom design or planning before the final proposal.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Tier</Label>
                      <Select value={tier} onValueChange={setTier}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(tierLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Fee Amount</Label>
                      <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox checked={creditEligible} onCheckedChange={(checked) => setCreditEligible(checked === true)} />
                      Credit eligible
                    </label>
                    <div className="space-y-2">
                      <Label>Credit Expires</Label>
                      <Input type="date" value={creditExpiresAt} onChange={(event) => setCreditExpiresAt(event.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Scope Summary</Label>
                    <Textarea value={scopeSummary} onChange={(event) => setScopeSummary(event.target.value)} rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label>Internal Notes</Label>
                    <Textarea value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} rows={3} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Saving..." : "Require Agreement"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <>
              <Dialog open={sendOpen} onOpenChange={setSendOpen}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Send Design + Planning Agreement</DialogTitle>
                    <DialogDescription>
                      Share the secure agreement link or email it directly to the customer.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {agreement.signatureEmailSentAt && (
                      <Alert className="border-emerald-300 bg-emerald-50">
                        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                        <AlertDescription className="text-emerald-900">
                          Email sent {new Date(agreement.signatureEmailSentAt).toLocaleString()}
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <Label>Signing Link</Label>
                      <div className="flex gap-2">
                        <Input
                          value={agreementSigningLink || signingLink}
                          readOnly
                          className="font-mono text-sm"
                          data-testid="input-planning-agreement-signing-link"
                        />
                        <Button type="button" variant="outline" onClick={copySigningLink} disabled={!(agreementSigningLink || signingLink)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!(agreementSigningLink || signingLink)}
                          onClick={() => window.open(agreementSigningLink || signingLink, "_blank", "noopener,noreferrer")}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="border-t pt-4 space-y-3">
                      <Label className="text-sm font-medium">Send via Email</Label>
                      {!quote?.account?.email ? (
                        <Alert className="border-amber-300 bg-amber-50">
                          <AlertCircle className="h-4 w-4 text-amber-700" />
                          <AlertDescription className="text-amber-900">
                            Add a customer email address before sending the agreement.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <>
                          <div className="text-sm text-muted-foreground">
                            Sending to: <span className="font-medium text-foreground">{quote.account.email}</span>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="planning-agreement-message" className="text-sm">
                              Personal Message <span className="text-muted-foreground">(optional)</span>
                            </Label>
                            <Textarea
                              id="planning-agreement-message"
                              value={agreementEmailMessage}
                              onChange={(event) => setAgreementEmailMessage(event.target.value)}
                              rows={3}
                              className="resize-none"
                              placeholder="Please review and sign the Design + Planning Agreement so we can begin the planning work."
                              data-testid="input-planning-agreement-email-message"
                            />
                          </div>
                          <Button
                            type="button"
                            onClick={() => sendAgreementEmailMutation.mutate()}
                            disabled={sendAgreementEmailMutation.isPending}
                            className="w-full"
                            data-testid="button-send-planning-agreement-email"
                          >
                            <Mail className="mr-2 h-4 w-4" />
                            {sendAgreementEmailMutation.isPending
                              ? "Sending..."
                              : agreement.signatureEmailSentAt
                                ? "Resend Email"
                                : "Send Email"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setSendOpen(false)}>
                      Done
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {!["waived", "credited", "canceled", "expired"].includes(agreement.status) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isArchivedVersion || prepareSigningMutation.isPending}
                  onClick={openSigningDialog}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {agreement.signatureEmailSentAt ? "Agreement Link" : "Send Agreement"}
                </Button>
              )}
              {agreement.status === "required" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isArchivedVersion || actionMutation.isPending}
                  onClick={() => actionMutation.mutate({ path: `/api/planning-agreements/${agreement.id}/send` })}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Mark Sent
                </Button>
              )}
              {["required", "sent"].includes(agreement.status) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isArchivedVersion || actionMutation.isPending}
                  onClick={() => actionMutation.mutate({ path: `/api/planning-agreements/${agreement.id}/mark-signed` })}
                >
                  <FileCheck2 className="mr-2 h-4 w-4" />
                  Mark Signed
                </Button>
              )}
              {!agreement.paymentConfirmedAt && !["waived", "credited", "canceled", "expired"].includes(agreement.status) && (
                <Dialog open={paymentOpen} onOpenChange={(open) => {
                  setPaymentOpen(open);
                  if (open) setAmount(agreement.amount?.toString() || amount);
                }}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={isArchivedVersion}>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Confirm Paid
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Confirm Manual Payment</DialogTitle>
                      <DialogDescription>
                        Record payment only after it was verified in the outside payment system.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Amount Confirmed</Label>
                          <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
                        </div>
                        <div className="space-y-2">
                          <Label>Method</Label>
                          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(paymentMethodLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Reference</Label>
                        <Input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Invoice, check, transaction, or note" />
                      </div>
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} rows={3} />
                      </div>
                      <label className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                        <Checkbox checked={paymentVerified} onCheckedChange={(checked) => setPaymentVerified(checked === true)} />
                        <span>I verified this payment outside Rainmaker.</span>
                      </label>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
                      <Button type="button" onClick={() => confirmPaymentMutation.mutate()} disabled={!paymentVerified || confirmPaymentMutation.isPending}>
                        {confirmPaymentMutation.isPending ? "Confirming..." : "Confirm Payment"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {agreement.status === "paid_active" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isArchivedVersion || actionMutation.isPending}
                  onClick={() => actionMutation.mutate({ path: `/api/planning-agreements/${agreement.id}/mark-delivered` })}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark Delivered
                </Button>
              )}
              {canApplyCredit && (
                <Dialog open={creditOpen} onOpenChange={(open) => {
                  setCreditOpen(open);
                  if (open) setCreditAmount(agreement.amount?.toString() || "");
                }}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={isArchivedVersion || creditExpired}>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Apply Credit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Apply Planning Credit</DialogTitle>
                      <DialogDescription>
                        This records a credit against the quote family without changing taxable line item pricing.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                      <Label>Credit Amount</Label>
                      <Input value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} inputMode="decimal" />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setCreditOpen(false)}>Cancel</Button>
                      <Button type="button" onClick={() => applyCreditMutation.mutate()} disabled={applyCreditMutation.isPending}>
                        {applyCreditMutation.isPending ? "Applying..." : "Apply Credit"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {!["waived", "credited", "canceled", "expired"].includes(agreement.status) && (
                <Dialog open={waiveOpen} onOpenChange={setWaiveOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" disabled={isArchivedVersion}>Waive</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Waive Planning Agreement</DialogTitle>
                      <DialogDescription>
                        Use this when planning is not required for this job after review.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                      <Label>Waiver Reason</Label>
                      <Textarea value={waiverReason} onChange={(event) => setWaiverReason(event.target.value)} rows={3} />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setWaiveOpen(false)}>Cancel</Button>
                      <Button type="button" onClick={() => waiveMutation.mutate()} disabled={!waiverReason.trim() || waiveMutation.isPending}>
                        {waiveMutation.isPending ? "Waiving..." : "Waive Agreement"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
