import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { people_v1 } from 'googleapis';

export interface GoogleOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}

export interface GoogleContactData {
  resourceName?: string;
  etag?: string;
  names?: Array<{
    givenName?: string;
    familyName?: string;
    displayName?: string;
  }>;
  emailAddresses?: Array<{
    value?: string;
    type?: string;
  }>;
  phoneNumbers?: Array<{
    value?: string;
    type?: string;
  }>;
  addresses?: Array<{
    streetAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    extendedAddress?: string;
    type?: string;
  }>;
  organizations?: Array<{
    name?: string;
    title?: string;
  }>;
  metadata?: {
    sources?: Array<{
      updateTime?: string;
    }>;
  };
}

export class GoogleContactsService {
  private oauth2Client: OAuth2Client;
  private peopleService: people_v1.People;

  constructor(tokens: GoogleOAuthTokens) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.REPLIT_DEV_DOMAIN}/api/google-contacts/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    this.oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    this.peopleService = google.people({ version: 'v1', auth: this.oauth2Client });
  }

  async refreshTokenIfNeeded(): Promise<GoogleOAuthTokens> {
    const credentials = await this.oauth2Client.getAccessToken();
    return {
      access_token: credentials.token || '',
      refresh_token: this.oauth2Client.credentials.refresh_token || undefined,
      expiry_date: this.oauth2Client.credentials.expiry_date || undefined,
    };
  }

  async listContacts(pageSize: number = 100, pageToken?: string, syncToken?: string): Promise<{
    contacts: GoogleContactData[];
    nextPageToken?: string;
    nextSyncToken?: string;
  }> {
    try {
      const params: people_v1.Params$Resource$People$Connections$List = {
        resourceName: 'people/me',
        personFields: 'names,emailAddresses,phoneNumbers,addresses,organizations,metadata',
        pageSize,
      };

      if (syncToken) {
        params.syncToken = syncToken;
        params.requestSyncToken = true;
      } else {
        params.requestSyncToken = true;
        if (pageToken) {
          params.pageToken = pageToken;
        }
      }

      const response = await this.peopleService.people.connections.list(params);

      return {
        contacts: (response.data.connections || []) as GoogleContactData[],
        nextPageToken: response.data.nextPageToken || undefined,
        nextSyncToken: response.data.nextSyncToken || undefined,
      };
    } catch (error: any) {
      if (error.code === 410) {
        throw new Error('SYNC_TOKEN_EXPIRED');
      }
      throw error;
    }
  }

  async getContact(resourceName: string): Promise<GoogleContactData | null> {
    try {
      const response = await this.peopleService.people.get({
        resourceName,
        personFields: 'names,emailAddresses,phoneNumbers,addresses,organizations,metadata',
      });

      return response.data as GoogleContactData;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  async createContact(contactData: {
    firstName?: string;
    lastName?: string;
    company?: string;
    email?: string;
    phone?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  }): Promise<GoogleContactData> {
    const person: people_v1.Schema$Person = {};

    if (contactData.firstName || contactData.lastName) {
      person.names = [{
        givenName: contactData.firstName || '',
        familyName: contactData.lastName || '',
      }];
    }

    if (contactData.email) {
      person.emailAddresses = [{
        value: contactData.email,
        type: 'work',
      }];
    }

    if (contactData.phone) {
      person.phoneNumbers = [{
        value: contactData.phone,
        type: 'work',
      }];
    }

    if (contactData.company) {
      person.organizations = [{
        name: contactData.company,
      }];
    }

    if (contactData.streetAddress || contactData.city || contactData.state || contactData.zipCode) {
      person.addresses = [{
        streetAddress: contactData.streetAddress || '',
        city: contactData.city || '',
        region: contactData.state || '',
        postalCode: contactData.zipCode || '',
        country: contactData.country || 'US',
        type: 'work',
      }];
    }

    const response = await this.peopleService.people.createContact({
      requestBody: person,
    });

    return response.data as GoogleContactData;
  }

  async updateContact(resourceName: string, etag: string, contactData: {
    firstName?: string;
    lastName?: string;
    company?: string;
    email?: string;
    phone?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  }): Promise<GoogleContactData> {
    const person: people_v1.Schema$Person = {
      resourceName,
      etag,
    };

    if (contactData.firstName || contactData.lastName) {
      person.names = [{
        givenName: contactData.firstName || '',
        familyName: contactData.lastName || '',
      }];
    }

    if (contactData.email) {
      person.emailAddresses = [{
        value: contactData.email,
        type: 'work',
      }];
    }

    if (contactData.phone) {
      person.phoneNumbers = [{
        value: contactData.phone,
        type: 'work',
      }];
    }

    if (contactData.company) {
      person.organizations = [{
        name: contactData.company,
      }];
    }

    if (contactData.streetAddress || contactData.city || contactData.state || contactData.zipCode) {
      person.addresses = [{
        streetAddress: contactData.streetAddress || '',
        city: contactData.city || '',
        region: contactData.state || '',
        postalCode: contactData.zipCode || '',
        country: contactData.country || 'US',
        type: 'work',
      }];
    }

    const response = await this.peopleService.people.updateContact({
      resourceName,
      updatePersonFields: 'names,emailAddresses,phoneNumbers,addresses,organizations',
      requestBody: person,
    });

    return response.data as GoogleContactData;
  }

  async deleteContact(resourceName: string): Promise<void> {
    await this.peopleService.people.deleteContact({
      resourceName,
    });
  }

  static getAuthorizationUrl(userId: number): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.REPLIT_DEV_DOMAIN}/api/google-contacts/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: userId.toString(),
      prompt: 'consent',
    });
  }

  static async exchangeCodeForTokens(code: string): Promise<GoogleOAuthTokens> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.REPLIT_DEV_DOMAIN}/api/google-contacts/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    return {
      access_token: tokens.access_token || '',
      refresh_token: tokens.refresh_token || undefined,
      expiry_date: tokens.expiry_date || undefined,
    };
  }
}
