import {
  sendEmail as sendReplitGmailEmail,
  type InlineAttachment,
} from "./gmail";
import { sendGoogleWorkspaceEmail } from "./googleWorkspaceEmail";
import { sendResendEmail } from "./resendEmail";

export type EmailProvider = "replit-gmail" | "google-workspace-gmail" | "resend";

export interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  inlineAttachments?: InlineAttachment[];
}

function getEmailProvider(): EmailProvider {
  const provider = (process.env.EMAIL_PROVIDER || "replit-gmail").trim();

  if (provider === "replit-gmail" || provider === "google-workspace-gmail" || provider === "resend") {
    return provider;
  }

  throw new Error(
    `Unsupported EMAIL_PROVIDER "${provider}". Supported providers: replit-gmail, google-workspace-gmail, resend.`
  );
}

export async function sendEmail(params: SendEmailParams) {
  switch (getEmailProvider()) {
    case "replit-gmail":
      return sendReplitGmailEmail(params);
    case "google-workspace-gmail":
      return sendGoogleWorkspaceEmail(params);
    case "resend":
      return sendResendEmail(params);
  }
}

export type { InlineAttachment };
