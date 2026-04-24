import axios from 'axios';
import { storage } from './storage';
import { buildAppUrl } from './config';

const QB_API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com';

const QB_OAUTH_BASE = 'https://oauth.platform.intuit.com/oauth2/v1';

export interface QuickBooksConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: 'sandbox' | 'production';
}

export class QuickBooksService {
  private config: QuickBooksConfig;

  constructor(config: QuickBooksConfig) {
    this.config = config;
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: this.config.redirectUri,
      state: state
    });

    return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    realmId: string;
  }> {
    const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    try {
      console.log('Exchanging authorization code for tokens...');
      console.log('Redirect URI being used:', this.config.redirectUri);
      console.log('OAuth Base URL:', QB_OAUTH_BASE);
      
      const response = await axios.post(
        `${QB_OAUTH_BASE}/tokens/bearer`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: this.config.redirectUri
        }).toString(),
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          }
        }
      );

      console.log('Token exchange successful!');
      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        realmId: response.data.realm_id || ''
      };
    } catch (error: any) {
      console.error('QuickBooks token exchange failed!');
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      throw new Error(
        error.response?.data?.error_description || 
        error.response?.data?.error || 
        'Failed to exchange authorization code for tokens'
      );
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    const response = await axios.post(
      `${QB_OAUTH_BASE}/tokens/bearer`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }).toString(),
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in
    };
  }

  async getValidAccessToken(): Promise<string | null> {
    const settings = await storage.getQuickBooksSettings();
    if (!settings) return null;

    const now = new Date();
    const expiresAt = new Date(settings.tokenExpiresAt);

    if (now >= expiresAt) {
      try {
        const tokens = await this.refreshAccessToken(settings.refreshToken);
        const newExpiresAt = new Date(now.getTime() + tokens.expiresIn * 1000);
        
        await storage.updateQuickBooksTokens(
          settings.realmId,
          tokens.accessToken,
          tokens.refreshToken,
          newExpiresAt
        );

        return tokens.accessToken;
      } catch (error) {
        console.error('Failed to refresh QuickBooks token:', error);
        return null;
      }
    }

    return settings.accessToken;
  }

  async createCustomer(accountData: {
    name: string;
    email: string;
    phone?: string;
    billingAddress?: string;
  }): Promise<{ id: string } | null> {
    const accessToken = await this.getValidAccessToken();
    const settings = await storage.getQuickBooksSettings();
    
    if (!accessToken || !settings) return null;

    const customerData: any = {
      DisplayName: accountData.name,
      PrimaryEmailAddr: accountData.email ? { Address: accountData.email } : undefined,
      PrimaryPhone: accountData.phone ? { FreeFormNumber: accountData.phone } : undefined
    };

    if (accountData.billingAddress) {
      const lines = accountData.billingAddress.split('\n');
      customerData.BillAddr = {
        Line1: lines[0] || '',
        Line2: lines[1] || '',
        City: '',
        CountrySubDivisionCode: '',
        PostalCode: ''
      };
    }

    try {
      const response = await axios.post(
        `${QB_API_BASE}/v3/company/${settings.realmId}/customer`,
        customerData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      return { id: response.data.Customer.Id };
    } catch (error: any) {
      console.error('Failed to create QuickBooks customer:', error.response?.data || error.message);
      return null;
    }
  }

  async createEstimate(quoteData: {
    quoteNumber: string;
    customerId: string;
    lineItems: Array<{
      description: string;
      quantity: string;
      amount: number;
    }>;
    taxRate?: number;
    discount?: number;
    shipping?: number;
    isShippingTaxable?: boolean;
    projectName?: string;
    notes?: string;
  }): Promise<{ id: string; docNumber: string } | null> {
    const accessToken = await this.getValidAccessToken();
    const settings = await storage.getQuickBooksSettings();
    
    if (!accessToken || !settings) return null;

    const lines = quoteData.lineItems.map((item, index) => ({
      LineNum: index + 1,
      Description: item.description,
      Amount: item.amount,
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        Qty: parseFloat(item.quantity),
        UnitPrice: item.amount / parseFloat(item.quantity),
        ItemRef: {
          value: '1',
          name: 'Services'
        }
      }
    }));

    if (quoteData.shipping && parseFloat(quoteData.shipping.toString()) > 0) {
      lines.push({
        LineNum: lines.length + 1,
        Description: 'Shipping',
        Amount: parseFloat(quoteData.shipping.toString()),
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: parseFloat(quoteData.shipping.toString()),
          ItemRef: {
            value: '1',
            name: 'Services'
          }
        }
      });
    }

    const estimateData: any = {
      Line: lines,
      CustomerRef: {
        value: quoteData.customerId
      },
      DocNumber: quoteData.quoteNumber,
      CustomerMemo: quoteData.notes ? { value: quoteData.notes } : undefined,
      PrivateNote: quoteData.projectName ? `Project: ${quoteData.projectName}` : undefined
    };

    try {
      const response = await axios.post(
        `${QB_API_BASE}/v3/company/${settings.realmId}/estimate`,
        estimateData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      return {
        id: response.data.Estimate.Id,
        docNumber: response.data.Estimate.DocNumber
      };
    } catch (error: any) {
      console.error('Failed to create QuickBooks estimate:', error.response?.data || error.message);
      throw new Error(error.response?.data?.Fault?.Error?.[0]?.Message || 'Failed to create estimate');
    }
  }

  async revokeTokens(): Promise<boolean> {
    const settings = await storage.getQuickBooksSettings();
    if (!settings) return false;

    const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    try {
      await axios.post(
        `${QB_OAUTH_BASE}/tokens/revoke`,
        new URLSearchParams({
          token: settings.refreshToken
        }).toString(),
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          }
        }
      );

      await storage.disconnectQuickBooks();
      return true;
    } catch (error) {
      console.error('Failed to revoke QuickBooks tokens:', error);
      return false;
    }
  }
}

export function createQuickBooksService(): QuickBooksService | null {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const redirectUri = process.env.QB_REDIRECT_URI || buildAppUrl("/api/quickbooks/callback");

  if (!clientId || !clientSecret) {
    console.warn('QuickBooks credentials not configured');
    return null;
  }

  return new QuickBooksService({
    clientId,
    clientSecret,
    redirectUri,
    environment: (process.env.QB_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox'
  });
}
