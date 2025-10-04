import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const issueReportSchema = z.object({
  description: z.string().min(1, "Description is required").max(5000, "Description is too long"),
  userAction: z.string().min(1, "What you were trying to do is required").max(1000, "Description is too long"),
});

type IssueReportForm = z.infer<typeof issueReportSchema>;

interface ReportIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Helper function to collect browser and health metrics
function collectHealthMetrics() {
  const metrics: any = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    screenResolution: `${screen.width}x${screen.height}`,
    browserLanguage: navigator.language,
    connectionType: (navigator as any).connection?.effectiveType || 'unknown',
  };

  // Browser detection
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) {
    metrics.browserName = 'Chrome';
    const match = ua.match(/Chrome\/(\d+)/);
    metrics.browserVersion = match ? match[1] : 'unknown';
  } else if (ua.includes('Firefox')) {
    metrics.browserName = 'Firefox';
    const match = ua.match(/Firefox\/(\d+)/);
    metrics.browserVersion = match ? match[1] : 'unknown';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    metrics.browserName = 'Safari';
    const match = ua.match(/Version\/(\d+)/);
    metrics.browserVersion = match ? match[1] : 'unknown';
  } else if (ua.includes('Edge')) {
    metrics.browserName = 'Edge';
    const match = ua.match(/Edge\/(\d+)/);
    metrics.browserVersion = match ? match[1] : 'unknown';
  } else {
    metrics.browserName = 'Unknown';
    metrics.browserVersion = 'unknown';
  }

  // Console errors from the last few minutes
  try {
    const recentErrors = (window as any).__recentConsoleErrors || [];
    metrics.recentErrors = recentErrors;
  } catch (e) {
    // Ignore if not available
  }

  // Performance data
  try {
    if (performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      metrics.memory = {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
      };
    }
  } catch (e) {
    // Ignore if not available
  }

  return metrics;
}

export function ReportIssueDialog({ open, onOpenChange }: ReportIssueDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<IssueReportForm>({
    resolver: zodResolver(issueReportSchema),
    defaultValues: {
      description: "",
      userAction: "",
    },
  });

  const createIssueReport = useMutation({
    mutationFn: async (data: IssueReportForm) => {
      const healthMetrics = collectHealthMetrics();
      
      const payload = {
        description: data.description,
        userAction: data.userAction,
        location: window.location.pathname,
        userAgent: navigator.userAgent,
        browserName: healthMetrics.browserName,
        browserVersion: healthMetrics.browserVersion,
        screenResolution: healthMetrics.screenResolution,
        healthMetrics: healthMetrics,
      };

      return apiRequest("POST", "/api/issue-reports", payload);
    },
    onSuccess: () => {
      toast({
        title: "Issue reported successfully",
        description: "Thank you for your feedback. We'll look into this issue.",
      });
      form.reset();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/issue-reports"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to report issue",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: IssueReportForm) => {
    createIssueReport.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-report-issue">
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>
            Help us improve by reporting what went wrong. We'll use this information to fix the issue.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What went wrong?</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the issue you encountered..."
                      className="min-h-[100px]"
                      data-testid="textarea-issue-description"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="userAction"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What were you trying to do?</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe what you were trying to accomplish when the issue occurred..."
                      className="min-h-[80px]"
                      data-testid="textarea-user-action"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-report"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createIssueReport.isPending}
                data-testid="button-submit-report"
              >
                {createIssueReport.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Report Issue
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}