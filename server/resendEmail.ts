import type { SendEmailParams } from "./email";

interface ResendAttachment {
  filename: string;
  content: string;
  contentId?: string;
}

function requireResendEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for EMAIL_PROVIDER=resend`);
  }
  return value;
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function formatAddress(email: string, name?: string): string {
  const sanitizedEmail = sanitizeHeader(email);
  const sanitizedName = name ? sanitizeHeader(name).replace(/"/g, '\\"') : "";

  if (!sanitizedName || sanitizedEmail.includes("<")) {
    return sanitizedEmail;
  }

  return `"${sanitizedName}" <${sanitizedEmail}>`;
}

function getFromAddress(): string {
  const email =
    process.env.RESEND_EMAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    process.env.GOOGLE_WORKSPACE_EMAIL_FROM?.trim();

  if (!email) {
    throw new Error("RESEND_EMAIL_FROM or EMAIL_FROM is required for EMAIL_PROVIDER=resend");
  }

  const name =
    process.env.RESEND_EMAIL_FROM_NAME?.trim() ||
    process.env.EMAIL_FROM_NAME?.trim() ||
    process.env.GOOGLE_WORKSPACE_EMAIL_FROM_NAME?.trim();

  return formatAddress(email, name);
}

function buildAttachments(params: SendEmailParams): ResendAttachment[] | undefined {
  if (!params.inlineAttachments?.length) {
    return undefined;
  }

  return params.inlineAttachments.map((attachment) => ({
    filename: attachment.filename,
    content: attachment.base64Data,
    contentId: attachment.contentId,
  }));
}

function getResendErrorMessage(status: number, statusText: string, body: unknown): string {
  if (body && typeof body === "object" && "message" in body) {
    return String((body as { message?: unknown }).message);
  }

  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }

  return `${status} ${statusText}`.trim();
}

export async function sendResendEmail(params: SendEmailParams) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireResendEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "User-Agent": "EDG-Rainmaker/1.0",
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [params.to],
      subject: params.subject,
      html: params.htmlBody,
      text: params.textBody,
      attachments: buildAttachments(params),
    }),
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text().catch(() => undefined);
  }

  if (!response.ok) {
    throw new Error(
      `Resend email failed: ${getResendErrorMessage(response.status, response.statusText, body)}`
    );
  }

  return body;
}
