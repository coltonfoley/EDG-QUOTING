import { db } from './db';
import { accounts, googleContactsSync } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { GoogleContactsService, type GoogleContactData } from './googleContacts';
import type { Account } from '@shared/schema';

export interface SyncResult {
  imported: number;
  updated: number;
  pushed: number;
  errors: string[];
}

export class GoogleContactsSyncEngine {
  private service: GoogleContactsService;

  constructor(userEmail: string) {
    this.service = GoogleContactsService.fromEnv(userEmail);
  }

  async performFullSync(): Promise<SyncResult> {
    const result: SyncResult = {
      imported: 0,
      updated: 0,
      pushed: 0,
      errors: [],
    };

    try {
      await this.pullFromGoogle(result);
    } catch (error) {
      result.errors.push(`Full sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  private async pullFromGoogle(result: SyncResult): Promise<void> {
    let pageToken: string | undefined;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.service.listContacts(100, pageToken);
        
        for (const googleContact of response.contacts) {
          try {
            const wasUpdated = await this.importGoogleContact(googleContact);
            if (wasUpdated) {
              result.updated++;
            } else {
              result.imported++;
            }
          } catch (error) {
            result.errors.push(`Failed to import contact ${googleContact.resourceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        pageToken = response.nextPageToken;
        hasMore = !!pageToken;
      } catch (error) {
        result.errors.push(`Failed to fetch Google contacts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        hasMore = false;
      }
    }
  }

  private async importGoogleContact(googleContact: GoogleContactData): Promise<boolean> {
    if (!googleContact.resourceName) {
      return false;
    }

    const accountData = this.mapGoogleToAccount(googleContact);
    
    if (!accountData.email || !accountData.phone || !accountData.name) {
      console.log(`Skipping contact ${googleContact.resourceName} - missing required fields (email: ${!!accountData.email}, phone: ${!!accountData.phone}, name: ${!!accountData.name})`);
      return false;
    }

    const [existingSync] = await db
      .select()
      .from(googleContactsSync)
      .where(eq(googleContactsSync.googleResourceName, googleContact.resourceName));

    if (existingSync) {
      const [existingAccount] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, existingSync.accountId));

      if (existingAccount) {
        await db.update(accounts)
          .set({
            ...accountData,
            googleContactId: googleContact.resourceName,
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, existingSync.accountId));

        await db.update(googleContactsSync)
          .set({
            googleEtag: googleContact.etag,
            lastSyncedAt: new Date(),
            googleUpdatedAt: this.getGoogleUpdateTime(googleContact),
          })
          .where(eq(googleContactsSync.id, existingSync.id));
        
        return true;
      }
    }

    const existingAccountByEmail = await db
      .select()
      .from(accounts)
      .where(eq(accounts.email, accountData.email as string))
      .limit(1);

    if (existingAccountByEmail.length > 0) {
      const existingAccount = existingAccountByEmail[0];
      
      await db.update(accounts)
        .set({
          ...accountData,
          googleContactId: googleContact.resourceName,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, existingAccount.id));

      const [existingSyncForAccount] = await db
        .select()
        .from(googleContactsSync)
        .where(eq(googleContactsSync.accountId, existingAccount.id));

      if (existingSyncForAccount) {
        await db.update(googleContactsSync)
          .set({
            googleResourceName: googleContact.resourceName,
            googleEtag: googleContact.etag,
            lastSyncedAt: new Date(),
            googleUpdatedAt: this.getGoogleUpdateTime(googleContact),
          })
          .where(eq(googleContactsSync.id, existingSyncForAccount.id));
      } else {
        await db.insert(googleContactsSync).values({
          accountId: existingAccount.id,
          googleResourceName: googleContact.resourceName,
          googleEtag: googleContact.etag,
          lastSyncedAt: new Date(),
          googleUpdatedAt: this.getGoogleUpdateTime(googleContact),
          syncDirection: 'pull',
        });
      }

      return true;
    }

    const [newAccount] = await db.insert(accounts)
      .values({
        ...accountData,
        googleContactId: googleContact.resourceName,
      } as any)
      .returning();

    await db.insert(googleContactsSync).values({
      accountId: newAccount.id,
      googleResourceName: googleContact.resourceName,
      googleEtag: googleContact.etag,
      lastSyncedAt: new Date(),
      googleUpdatedAt: this.getGoogleUpdateTime(googleContact),
      syncDirection: 'pull',
    });

    return false;
  }

  async pushAccountToGoogle(accountId: number): Promise<void> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    
    if (!account) {
      throw new Error('Account not found');
    }

    const [existingSync] = await db
      .select()
      .from(googleContactsSync)
      .where(eq(googleContactsSync.accountId, accountId));

    if (existingSync && existingSync.googleResourceName) {
      const googleContact = await this.service.getContact(existingSync.googleResourceName);
      
      if (googleContact && googleContact.etag) {
        await this.service.updateContact(
          existingSync.googleResourceName,
          googleContact.etag,
          this.mapAccountToGoogle(account)
        );

        await db.update(googleContactsSync)
          .set({
            lastSyncedAt: new Date(),
            localUpdatedAt: account.updatedAt,
            syncDirection: 'push',
          })
          .where(eq(googleContactsSync.id, existingSync.id));
      }
    } else {
      const newGoogleContact = await this.service.createContact(this.mapAccountToGoogle(account));
      
      if (newGoogleContact.resourceName) {
        if (existingSync) {
          await db.update(googleContactsSync)
            .set({
              googleResourceName: newGoogleContact.resourceName,
              googleEtag: newGoogleContact.etag,
              lastSyncedAt: new Date(),
              localUpdatedAt: account.updatedAt,
              syncDirection: 'push',
            })
            .where(eq(googleContactsSync.id, existingSync.id));
        } else {
          await db.insert(googleContactsSync).values({
            accountId: account.id,
            googleResourceName: newGoogleContact.resourceName,
            googleEtag: newGoogleContact.etag,
            lastSyncedAt: new Date(),
            localUpdatedAt: account.updatedAt,
            syncDirection: 'push',
          });
        }

        await db.update(accounts)
          .set({ googleContactId: newGoogleContact.resourceName })
          .where(eq(accounts.id, accountId));
      }
    }
  }

  async deleteAccountFromGoogle(accountId: number): Promise<void> {
    const [existingSync] = await db
      .select()
      .from(googleContactsSync)
      .where(eq(googleContactsSync.accountId, accountId));

    if (existingSync && existingSync.googleResourceName) {
      try {
        await this.service.deleteContact(existingSync.googleResourceName);
      } catch (error) {
        console.error(`Failed to delete Google contact: ${error}`);
      }

      await db.delete(googleContactsSync).where(eq(googleContactsSync.id, existingSync.id));
    }
  }

  private mapGoogleToAccount(googleContact: GoogleContactData): Partial<Account> {
    const name = googleContact.names?.[0];
    const email = googleContact.emailAddresses?.[0];
    const phone = googleContact.phoneNumbers?.[0];
    const address = googleContact.addresses?.[0];
    const organization = googleContact.organizations?.[0];

    const accountData: any = {
      name: name?.displayName || `${name?.givenName || ''} ${name?.familyName || ''}`.trim() || 'Unknown',
      firstName: name?.givenName || null,
      lastName: name?.familyName || null,
      email: email?.value || '',
      phone: phone?.value || '',
      company: organization?.name || null,
      streetAddress: address?.streetAddress || null,
      addressLine2: address?.extendedAddress || null,
      city: address?.city || null,
      state: address?.region || null,
      zipCode: address?.postalCode || null,
      country: address?.country || null,
    };

    const secondaryEmails = googleContact.emailAddresses?.slice(1) || [];
    const secondaryPhones = googleContact.phoneNumbers?.slice(1) || [];
    
    if (secondaryEmails.length > 0 || secondaryPhones.length > 0) {
      accountData.secondaryContacts = JSON.stringify(
        [...secondaryEmails.map(e => ({ type: 'email', value: e.value })),
         ...secondaryPhones.map(p => ({ type: 'phone', value: p.value }))]
      );
    }

    return accountData;
  }

  private mapAccountToGoogle(account: Account): {
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
  } {
    return {
      firstName: account.firstName || undefined,
      lastName: account.lastName || undefined,
      company: account.company || undefined,
      email: account.email,
      phone: account.phone,
      streetAddress: account.streetAddress || undefined,
      city: account.city || undefined,
      state: account.state || undefined,
      zipCode: account.zipCode || undefined,
      country: account.country || undefined,
    };
  }

  private getGoogleUpdateTime(googleContact: GoogleContactData): Date | null {
    const updateTime = googleContact.metadata?.sources?.[0]?.updateTime;
    return updateTime ? new Date(updateTime) : null;
  }
}
