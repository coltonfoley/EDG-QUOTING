type OperationsImportData = {
  existing?: boolean;
  job?: {
    id?: number | string;
    title?: string | null;
    projectCode?: string | null;
    jobNumber?: string | null;
  } | null;
};

type OperationsImportResult = {
  success?: boolean;
  skipped?: boolean;
  status?: number;
  message?: string;
  data?: OperationsImportData | unknown;
};

type ToastPayload = {
  title: string;
  description: string;
  variant?: "default" | "destructive";
};

const getImportedJobLabel = (data: OperationsImportData | unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const job = (data as OperationsImportData).job;
  if (!job || typeof job !== "object") return null;
  return job.projectCode || job.jobNumber || job.title || (job.id ? `job ${job.id}` : null);
};

export function getStageUpdateToast(updatedQuote: any, targetStage: string): ToastPayload {
  const operationsImport = updatedQuote?.operationsImport as OperationsImportResult | undefined;

  if (targetStage !== "closed_won" || !operationsImport) {
    return {
      title: "Deal stage updated",
      description: "The quote was updated successfully.",
    };
  }

  if (operationsImport.success) {
    const jobLabel = getImportedJobLabel(operationsImport.data);
    return {
      title: "Won quote sent to Ops",
      description: jobLabel
        ? `Ops is ready with ${jobLabel}.`
        : "Ops received the won quote and is ready to work from it.",
    };
  }

  if (operationsImport.skipped) {
    return {
      title: "Quote marked won",
      description: operationsImport.message || "Ops handoff is currently disabled or not configured.",
    };
  }

  return {
    title: "Quote marked won, Ops needs attention",
    description: operationsImport.message || "The quote stage changed, but the Ops handoff did not complete.",
    variant: "destructive",
  };
}
