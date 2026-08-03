export const leadWorkflowStatuses = [
  "new",
  "draft_ready",
  "contacted",
  "archived",
] as const;

export type LeadWorkflowStatus = typeof leadWorkflowStatuses[number];

export type LeadWorkflowProjectionInput = {
  storedStatus?: string | null;
  assessmentOutcome?: string | null;
  gmailMessageId?: string | null;
  convertedQuoteId?: number | null;
};

export function projectLeadWorkflowStatus({
  storedStatus,
  assessmentOutcome,
  gmailMessageId,
  convertedQuoteId,
}: LeadWorkflowProjectionInput): LeadWorkflowStatus {
  if (convertedQuoteId || storedStatus === "converted") {
    return "contacted";
  }

  if (storedStatus === "archived" || storedStatus === "unresponsive" || assessmentOutcome === "not_fit") {
    return "archived";
  }

  if (storedStatus === "draft_ready") {
    return "draft_ready";
  }

  if (
    storedStatus === "contacted"
    || storedStatus === "qualified"
  ) {
    return "contacted";
  }

  if (assessmentOutcome === "fit" && Boolean(gmailMessageId?.trim())) {
    return "draft_ready";
  }

  return "new";
}

export function effectiveGmailDraftUrl(input: {
  manualGmailDraftUrl?: string | null;
  assessmentGmailDraftUrl?: string | null;
}): string | null {
  return input.manualGmailDraftUrl || input.assessmentGmailDraftUrl || null;
}

export function effectiveDraftEmailContent(input: {
  manualDraftEmailContent?: string | null;
  assessmentDraftEmailContent?: string | null;
}): string | null {
  return input.manualDraftEmailContent?.trim()
    || input.assessmentDraftEmailContent?.trim()
    || null;
}

export function gmailDraftHref(input: {
  gmailDraftUrl?: string | null;
  gmailMessageId?: string | null;
}): string | null {
  if (input.gmailDraftUrl) {
    try {
      const url = new URL(input.gmailDraftUrl);
      if (
        url.protocol === "https:"
        && url.hostname === "mail.google.com"
        && /^\/mail\/u\/\d+\//.test(url.pathname)
        && url.hash.startsWith("#drafts")
      ) {
        return url.toString();
      }
    } catch {
      // Fall back to the verified Gmail message identifier.
    }
  }

  return input.gmailMessageId?.trim()
    ? `https://mail.google.com/mail/u/0/#drafts/${encodeURIComponent(input.gmailMessageId.trim())}`
    : null;
}
