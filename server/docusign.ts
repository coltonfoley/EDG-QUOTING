import { ApiClient, EnvelopesApi, EnvelopeDefinition, Document, Signer, SignHere, Tabs, Recipients } from 'docusign-esign';

export interface DocuSignConfig {
  integrationKey: string;
  accountId: string;
  basePath: string;
  accessToken: string;
}

export class DocuSignService {
  private apiClient: ApiClient;
  private accountId: string;

  constructor(config: DocuSignConfig) {
    this.apiClient = new ApiClient();
    this.apiClient.setBasePath(config.basePath);
    this.apiClient.addDefaultHeader('Authorization', `Bearer ${config.accessToken}`);
    this.accountId = config.accountId;
  }

  async sendEnvelope(
    documentContent: string,
    signerEmail: string,
    signerName: string,
    subject: string,
    emailBlurb?: string
  ): Promise<{ envelopeId: string; status: string }> {
    try {
      // Create the document
      const document: Document = {
        documentBase64: Buffer.from(documentContent).toString('base64'),
        name: 'Quote Document',
        fileExtension: 'pdf',
        documentId: '1'
      };

      // Create the signer
      const signer: Signer = {
        email: signerEmail,
        name: signerName,
        recipientId: '1',
        routingOrder: '1',
        tabs: {
          signHereTabs: [
            {
              documentId: '1',
              pageNumber: '1',
              xPosition: '100',
              yPosition: '100'
            } as SignHere
          ]
        } as Tabs
      };

      // Create the envelope definition
      const envelopeDefinition: EnvelopeDefinition = {
        emailSubject: subject,
        emailBlurb: emailBlurb || 'Please review and sign this quote.',
        documents: [document],
        recipients: {
          signers: [signer]
        } as Recipients,
        status: 'sent'
      };

      // Send the envelope
      const envelopesApi = new EnvelopesApi(this.apiClient);
      const result = await envelopesApi.createEnvelope(this.accountId, {
        envelopeDefinition
      });

      return {
        envelopeId: result.envelopeId!,
        status: result.status!
      };
    } catch (error) {
      console.error('DocuSign API Error:', error);
      throw new Error(`Failed to send envelope: ${error}`);
    }
  }

  async getEnvelopeStatus(envelopeId: string) {
    try {
      const envelopesApi = new EnvelopesApi(this.apiClient);
      const result = await envelopesApi.getEnvelope(this.accountId, envelopeId);
      return {
        envelopeId: result.envelopeId,
        status: result.status,
        statusDateTime: result.statusChangedDateTime
      };
    } catch (error) {
      console.error('DocuSign API Error:', error);
      throw new Error(`Failed to get envelope status: ${error}`);
    }
  }
}

// OAuth helper functions
export function getDocuSignAuthUrl(integrationKey: string, redirectUri: string, state?: string): string {
  const baseUrl = 'https://account-d.docusign.com/oauth/auth';
  const scope = 'signature impersonation';
  
  const params = new URLSearchParams({
    response_type: 'code',
    scope,
    client_id: integrationKey,
    redirect_uri: redirectUri,
    ...(state && { state })
  });

  return `${baseUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  integrationKey: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}> {
  const tokenUrl = 'https://account-d.docusign.com/oauth/token';
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${integrationKey}:${clientSecret}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

export async function getUserInfo(accessToken: string): Promise<{
  accounts: Array<{
    account_id: string;
    account_name: string;
    base_uri: string;
    is_default: boolean;
  }>;
  name: string;
  email: string;
}> {
  const response = await fetch('https://account-d.docusign.com/oauth/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return response.json();
}