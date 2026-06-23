import { sql, type SQL } from "drizzle-orm";
import { quoteApprovalDrawings } from "@shared/schema";

export function appendQuoteApprovalDrawingInternalNoteSql(note: string): SQL {
  return sql`
    CASE
      WHEN NULLIF(BTRIM(${quoteApprovalDrawings.internalNotes}), '') IS NULL THEN ${note}::text
      ELSE ${quoteApprovalDrawings.internalNotes} || E'\n' || ${note}::text
    END
  `;
}
