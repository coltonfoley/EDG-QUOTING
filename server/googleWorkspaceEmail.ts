import { gmail } from "@googleapis/gmail";
import { JWT, OAuth2Client } from "google-auth-library";
import type { InlineAttachment, SendEmailParams } from "./email";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for EMAIL_PROVIDER=google-workspace-gmail`);
  }
  return value;
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeSubjectLine(subject: string): string {
  const sanitizedSubject = sanitizeHeader(subject);
  if (!/[^\x00-\x7F]/.test(sanitizedSubject)) {
    return sanitizedSubject;
  }

  return `=?UTF-8?B?${Buffer.from(sanitizedSubject, "utf8").toString("base64")}?=`;
}

function getFromHeader(): string | undefined {
  const from = process.env.GOOGLE_WORKSPACE_EMAIL_FROM?.trim();
  if (!from) return undefined;

  const fromName = process.env.GOOGLE_WORKSPACE_EMAIL_FROM_NAME?.trim();
  if (!fromName) return sanitizeHeader(from);

  return `"${sanitizeHeader(fromName).replace(/"/g, '\\"')}" <${sanitizeHeader(from)}>`;
}

function getReplyToHeader(params: SendEmailParams): string | undefined {
  const replyTo =
    params.replyTo?.trim() ||
    process.env.GOOGLE_WORKSPACE_EMAIL_REPLY_TO?.trim() ||
    process.env.EMAIL_REPLY_TO?.trim();

  return replyTo ? sanitizeHeader(replyTo) : undefined;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function parseServiceAccountKey() {
  const serviceAccountKeyJson = optionalEnv("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!serviceAccountKeyJson) return null;

  try {
    return JSON.parse(serviceAccountKeyJson) as {
      client_email?: string;
      private_key?: string;
    };
  } catch {
    throw new Error("Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON");
  }
}

function encodeRawMessage(message: string): string {
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createAlternativeBodyParts(
  boundary: string,
  htmlBody: string,
  textBody?: string
): string[] {
  const parts: string[] = [];

  if (textBody) {
    parts.push(
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      textBody
    );
  }

  parts.push(
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    htmlBody,
    `--${boundary}--`
  );

  return parts;
}

function createMessage(params: SendEmailParams): string {
  const fromHeader = getFromHeader();
  const replyToHeader = getReplyToHeader(params);
  const headers = [
    fromHeader ? `From: ${fromHeader}` : undefined,
    replyToHeader ? `Reply-To: ${replyToHeader}` : undefined,
    `To: ${sanitizeHeader(params.to)}`,
    `Subject: ${encodeSubjectLine(params.subject)}`,
    "MIME-Version: 1.0",
  ].filter(Boolean) as string[];

  if (params.inlineAttachments?.length) {
    const relatedBoundary = `related_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const alternativeBoundary = `alternative_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const parts = [
      ...headers,
      `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
      "",
      `--${relatedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      "",
      ...createAlternativeBodyParts(alternativeBoundary, params.htmlBody, params.textBody),
    ];

    for (const attachment of params.inlineAttachments) {
      parts.push(...createInlineAttachmentParts(relatedBoundary, attachment));
    }

    parts.push(`--${relatedBoundary}--`);
    return parts.join("\r\n");
  }

  const alternativeBoundary = `alternative_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    ...createAlternativeBodyParts(alternativeBoundary, params.htmlBody, params.textBody),
  ].join("\r\n");
}

function createInlineAttachmentParts(
  boundary: string,
  attachment: InlineAttachment
): string[] {
  return [
    `--${boundary}`,
    `Content-Type: ${sanitizeHeader(attachment.mimeType)}; name="${sanitizeHeader(attachment.filename)}"`,
    "Content-Transfer-Encoding: base64",
    `Content-ID: <${sanitizeHeader(attachment.contentId)}>`,
    `Content-Disposition: inline; filename="${sanitizeHeader(attachment.filename)}"`,
    "",
    attachment.base64Data,
  ];
}

function getGmailClient() {
  const serviceAccountKey = parseServiceAccountKey();
  if (serviceAccountKey) {
    const fromEmail = requireEnv("GOOGLE_WORKSPACE_EMAIL_FROM");
    const jwtClient = new JWT({
      email: serviceAccountKey.client_email,
      key: serviceAccountKey.private_key,
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      subject: fromEmail,
    });

    return gmail({ version: "v1", auth: jwtClient });
  }

  const oauth2Client = new OAuth2Client(
    requireEnv("GOOGLE_WORKSPACE_CLIENT_ID"),
    requireEnv("GOOGLE_WORKSPACE_CLIENT_SECRET")
  );

  oauth2Client.setCredentials({
    refresh_token: requireEnv("GOOGLE_WORKSPACE_REFRESH_TOKEN"),
  });

  return gmail({ version: "v1", auth: oauth2Client });
}

export async function sendGoogleWorkspaceEmail(params: SendEmailParams) {
  const gmail = getGmailClient();
  const raw = encodeRawMessage(createMessage(params));

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return result.data;
}
