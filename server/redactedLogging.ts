type ValidationIssue = {
  code?: string;
  path?: Array<string | number>;
};

export function redactedErrorType(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export function validationIssueSummary(error: { errors?: ValidationIssue[] }) {
  const issues = error.errors || [];
  return {
    issueCount: issues.length,
    codes: Array.from(new Set(issues.map((issue) => issue.code || "unknown"))).sort(),
    paths: Array.from(new Set(issues.map((issue) => issue.path?.join(".") || "root"))).sort(),
  };
}
