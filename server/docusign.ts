// Using global fetch available in Node.js 18+
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

interface DocuSignConfig {
  integrationKey: string;
  secretKey: string;
  userId: string;
  baseUrl: string;
}

interface DocuSignTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface DocuSignRecipient {
  email: string;
  name: string;
  recipientId: string;
}

interface DocuSignDocument {
  documentBase64: string;
  documentId: string;
  fileExtension: string;
  name: string;
}

interface DocuSignTab {
  anchorString?: string;
  anchorXOffset?: string;
  anchorYOffset?: string;
  pageNumber?: string;
  xPosition?: string;
  yPosition?: string;
}

interface DocuSignEnvelopeRequest {
  documents: DocuSignDocument[];
  emailSubject: string;
  recipients: {
    signers: Array<DocuSignRecipient & {
      tabs?: {
        signHereTabs?: Array<DocuSignTab & { tabLabel?: string }>;
        dateSignedTabs?: Array<DocuSignTab & { tabLabel?: string }>;
      };
    }>;
  };
  status: 'created' | 'sent';
}

interface DocuSignEnvelopeResponse {
  envelopeId: string;
  status: string;
  statusDateTime: string;
}

interface DocuSignRecipientViewRequest {
  authenticationMethod: string;
  email: string;
  recipientId: string;
  returnUrl: string;
  userName: string;
  clientUserId?: string;
}

interface DocuSignRecipientViewResponse {
  url: string;
}

export class DocuSignService {
  private config: DocuSignConfig;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor() {
    this.config = {
      integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY!,
      secretKey: process.env.DOCUSIGN_SECRET_KEY!,
      userId: process.env.DOCUSIGN_USER_ID!,
      baseUrl: process.env.NODE_ENV === 'production' 
        ? 'https://na3.docusign.net/restapi/v2.1' 
        : 'https://demo.docusign.net/restapi/v2.1'
    };

    if (!this.config.integrationKey || !this.config.secretKey || !this.config.userId) {
      throw new Error('DocuSign credentials are not configured');
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  private async getAccessToken(): Promise<string> {
    // Check if current token is still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry.getTime() > Date.now() + 5 * 60 * 1000) {
      return this.accessToken;
    }

    // Get new token using JWT Bearer Grant
    const tokenResponse = await this.requestAccessTokenWithJWT();
    
    this.accessToken = tokenResponse.access_token;
    this.tokenExpiry = new Date(Date.now() + tokenResponse.expires_in * 1000);
    
    return this.accessToken;
  }

  /**
   * Request access token using JWT Bearer Grant
   */
  private async requestAccessTokenWithJWT(): Promise<DocuSignTokenResponse> {
    const jwtToken = this.generateJWTToken();
    
    const authUrl = this.config.baseUrl.includes('demo') 
      ? 'https://account-d.docusign.com/oauth/token'
      : 'https://account.docusign.com/oauth/token';

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwtToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DocuSign JWT auth failed:', response.status, errorText);
      throw new Error(`Failed to get access token: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json() as Promise<DocuSignTokenResponse>;
  }

  /**
   * Create and send an envelope for signature
   */
  async createAndSendEnvelope(
    documentBase64: string,
    recipient: DocuSignRecipient,
    subject: string,
    quoteNumber: string
  ): Promise<DocuSignEnvelopeResponse> {
    const accessToken = await this.getAccessToken();
    
    console.log('Creating DocuSign envelope for quote:', quoteNumber);
    console.log('Document size:', documentBase64.length, 'characters');
    console.log('Recipient email:', recipient.email);
    
    const envelopeRequest: DocuSignEnvelopeRequest = {
      emailSubject: subject,
      documents: [
        {
          documentBase64,
          documentId: '1',
          fileExtension: 'pdf',
          name: `Quote ${quoteNumber}.pdf`,
        },
      ],
      recipients: {
        signers: [
          {
            ...recipient,
            tabs: {
              signHereTabs: [
                {
                  anchorString: 'Customer Signature:',
                  anchorXOffset: '100',
                  anchorYOffset: '0',
                  tabLabel: 'CustomerSignature',
                },
              ],
              dateSignedTabs: [
                {
                  anchorString: 'Date:',
                  anchorXOffset: '50',
                  anchorYOffset: '0',
                  tabLabel: 'DateSigned',
                },
              ],
            },
          },
        ],
      },
      status: 'sent',
    };

    try {
      const response = await fetch(
        `${this.config.baseUrl}/accounts/${this.config.userId}/envelopes`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(envelopeRequest),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log('DocuSign API error:', response.status, errorText);
        
        // For development with mock authentication, return a simulated successful response
        if (accessToken === 'mock_access_token_for_development') {
          console.log('Using mock DocuSign envelope response for development');
          return {
            envelopeId: `mock_envelope_${Date.now()}`,
            status: 'sent',
            statusDateTime: new Date().toISOString(),
          } as DocuSignEnvelopeResponse;
        }
        
        throw new Error(`Failed to create envelope: ${response.statusText} - ${errorText}`);
      }

      return response.json() as Promise<DocuSignEnvelopeResponse>;
    } catch (error) {
      // If using mock authentication, return simulated response instead of failing
      if (accessToken === 'mock_access_token_for_development') {
        console.log('DocuSign API unavailable, using mock response for development');
        return {
          envelopeId: `mock_envelope_${Date.now()}`,
          status: 'sent',  
          statusDateTime: new Date().toISOString(),
        } as DocuSignEnvelopeResponse;
      }
      throw error;
    }
  }

  /**
   * Get the signing URL for a recipient
   */
  async getRecipientSigningUrl(
    envelopeId: string,
    recipient: DocuSignRecipient,
    returnUrl: string
  ): Promise<string> {
    const accessToken = await this.getAccessToken();
    
    // For development with mock authentication, return a mock signing URL
    if (accessToken === 'mock_access_token_for_development' || envelopeId.startsWith('mock_envelope_')) {
      console.log('Using mock DocuSign signing URL for development');
      return `https://demo.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=mock-demo-url&env=demo&ReturnUrl=${encodeURIComponent(returnUrl)}`;
    }
    
    const viewRequest: DocuSignRecipientViewRequest = {
      authenticationMethod: 'none',
      email: recipient.email,
      recipientId: recipient.recipientId,
      returnUrl,
      userName: recipient.name,
      clientUserId: recipient.recipientId,
    };

    const response = await fetch(
      `${this.config.baseUrl}/accounts/${this.config.userId}/envelopes/${envelopeId}/views/recipient`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(viewRequest),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get recipient view: ${response.statusText} - ${errorText}`);
    }

    const viewResponse = await response.json() as DocuSignRecipientViewResponse;
    return viewResponse.url;
  }

  /**
   * Get envelope status
   */
  async getEnvelopeStatus(envelopeId: string): Promise<any> {
    const accessToken = await this.getAccessToken();
    
    const response = await fetch(
      `${this.config.baseUrl}/accounts/${this.config.userId}/envelopes/${envelopeId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get envelope status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get envelope recipients and their signing status
   */
  async getEnvelopeRecipients(envelopeId: string): Promise<any> {
    const accessToken = await this.getAccessToken();
    
    const response = await fetch(
      `${this.config.baseUrl}/accounts/${this.config.userId}/envelopes/${envelopeId}/recipients`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get envelope recipients: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Convert PDF buffer to base64 string
   */
  static pdfToBase64(pdfBuffer: Buffer): string {
    return pdfBuffer.toString('base64');
  }

  /**
   * Validate webhook signature (implement based on DocuSign webhook security)
   */
  static validateWebhookSignature(signature: string, body: string, secret: string): boolean {
    // Implementation would depend on DocuSign's webhook signature algorithm
    // This is a placeholder for webhook signature validation
    return true;
  }
}

export default DocuSignService;