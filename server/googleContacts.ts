import { google } from 'googleapis';
import type { people_v1 } from 'googleapis';
import { JWT } from 'google-auth-library';

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
  private jwtClient: JWT;
  private peopleService: people_v1.People;
  private userEmail: string;

  constructor(serviceAccountKey: any, userEmail: string) {
    if (!serviceAccountKey) {
      throw new Error('Google Service Account credentials not configured. Please set GOOGLE_SERVICE_ACCOUNT_KEY environment variable.');
    }

    this.userEmail = userEmail;

    this.jwtClient = new JWT({
      email: serviceAccountKey.client_email,
      key: serviceAccountKey.private_key,
      scopes: ['https://www.googleapis.com/auth/contacts'],
      subject: userEmail, // Impersonate this user
    });

    this.peopleService = google.people({ version: 'v1', auth: this.jwtClient });
  }

  static fromEnv(userEmail: string): GoogleContactsService {
    const serviceAccountKeyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    
    if (!serviceAccountKeyJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set');
    }

    try {
      const serviceAccountKey = JSON.parse(serviceAccountKeyJson);
      return new GoogleContactsService(serviceAccountKey, userEmail);
    } catch (error) {
      throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON');
    }
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
}
