import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  // Check cached token only if it exists and hasn't expired
  if (connectionSettings?.settings?.expires_at && connectionSettings?.settings?.access_token) {
    if (new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
      return connectionSettings.settings.access_token;
    }
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings) {
    throw new Error('Gmail not connected');
  }

  const accessToken = connectionSettings.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new Error('Gmail access token not found');
  }
  return accessToken;
}

export async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export interface InlineAttachment {
  contentId: string;
  base64Data: string;
  mimeType: string;
  filename: string;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  inlineAttachments?: InlineAttachment[];
}) {
  const gmail = await getUncachableGmailClient();
  
  let message: string;
  
  if (params.inlineAttachments && params.inlineAttachments.length > 0) {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    const messageParts = [
      `To: ${params.to}`,
      'MIME-Version: 1.0',
      `Subject: ${params.subject}`,
      `Content-Type: multipart/related; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      params.htmlBody,
    ];
    
    for (const attachment of params.inlineAttachments) {
      messageParts.push(
        `--${boundary}`,
        `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-ID: <${attachment.contentId}>`,
        `Content-Disposition: inline; filename="${attachment.filename}"`,
        '',
        attachment.base64Data
      );
    }
    
    messageParts.push(`--${boundary}--`);
    message = messageParts.join('\r\n');
  } else {
    message = [
      `To: ${params.to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${params.subject}`,
      '',
      params.htmlBody
    ].join('\n');
  }

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });

  return result.data;
}
