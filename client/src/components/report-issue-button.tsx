import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquareX } from "lucide-react";
import { ReportIssueDialog } from "./report-issue-dialog";

export function ReportIssueButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        className="fixed bottom-6 left-6 z-50 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-red-600 hover:bg-red-700 text-white border-2 border-red-700"
        size="lg"
        data-testid="button-report-issue"
      >
        <MessageSquareX className="h-5 w-5 mr-2" />
        Report Issue
      </Button>

      <ReportIssueDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
      />
    </>
  );
}