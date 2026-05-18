import { sendGoogleWorkspaceEmail } from "./googleWorkspaceEmail";

export type EmailProvider = "google-workspace-gmail";

export interface InlineAttachment {
  contentId: string;
  base64Data: string;
  mimeType: string;
  filename: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  inlineAttachments?: InlineAttachment[];
}

function assertGoogleWorkspaceProvider(): EmailProvider {
  const provider = (process.env.EMAIL_PROVIDER || "google-workspace-gmail").trim();

  if (provider === "google-workspace-gmail") {
    return provider;
  }

  throw new Error(
    `Unsupported EMAIL_PROVIDER "${provider}". Rainmaker customer emails now use google-workspace-gmail only.`
  );
}

export async function sendEmail(params: SendEmailParams) {
  assertGoogleWorkspaceProvider();
  return sendGoogleWorkspaceEmail(params);
}
