import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AclConfigRepository } from '../../acl/acl-config.repository';
import type { AclConfigSnapshot } from '../../acl/acl.types';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesforceService } from '../../salesforce/salesforce.service';
import type { MetadataContactReference } from '../metadata.types';
import { normalizeEmail, requireString } from './metadata-common';

export type MetadataResolutionContext = {
  aclSnapshotPromise?: Promise<AclConfigSnapshot>;
  exportContactsById: Map<string, Promise<MetadataContactReference>>;
  targetContactsByEmail: Map<string, Promise<{ id: string; email: string } | null>>;
};

export type TargetContactResolutionMode = 'blocker' | 'warning';

@Injectable()
export class MetadataResolutionService {
  constructor(
    private readonly aclConfigRepository: AclConfigRepository,
    private readonly prisma: PrismaService,
    private readonly salesforceService: SalesforceService,
  ) {}

  createContext(): MetadataResolutionContext {
    return {
      exportContactsById: new Map(),
      targetContactsByEmail: new Map(),
    };
  }

  async resolveTargetContactByEmail(
    email: string,
    mode: TargetContactResolutionMode,
    blockers: string[],
    warnings: string[],
    context: MetadataResolutionContext,
  ): Promise<{ id: string; email: string } | null> {
    const normalizedEmail = normalizeEmail(email, 'contact email is required');
    let promise = context.targetContactsByEmail.get(normalizedEmail);

    if (!promise) {
      promise = this.salesforceService.findContactByEmail(normalizedEmail).then((contact) =>
        contact?.id
          ? {
              id: contact.id,
              email: normalizedEmail,
            }
          : null,
      );
      context.targetContactsByEmail.set(normalizedEmail, promise);
    }

    try {
      const contact = await promise;
      if (!contact) {
        const message = `Target Contact ${normalizedEmail} was not found in Salesforce`;
        if (mode === 'blocker') {
          blockers.push(message);
        } else {
          warnings.push(message);
        }
      }
      return contact;
    } catch (error) {
      const message =
        error instanceof Error
          ? `Unable to resolve Contact ${normalizedEmail}: ${error.message}`
          : `Unable to resolve Contact ${normalizedEmail}`;
      if (mode === 'blocker') {
        blockers.push(message);
      } else {
        warnings.push(message);
      }
      return null;
    }
  }

  async resolveExportContactReference(
    contactId: string,
    context: MetadataResolutionContext,
  ): Promise<MetadataContactReference> {
    const normalizedContactId = requireString(contactId, 'contactId is required');
    let promise = context.exportContactsById.get(normalizedContactId);

    if (!promise) {
      promise = (async () => {
        const contact = await this.salesforceService.findContactById(normalizedContactId);
        if (!contact?.email) {
          throw new BadRequestException(
            `Salesforce Contact ${normalizedContactId} is missing a unique email address`,
          );
        }

        const email = normalizeEmail(
          contact.email,
          `Salesforce Contact ${normalizedContactId} email is invalid`,
        );
        const resolved = await this.salesforceService.findContactByEmail(email);
        if (!resolved?.id || resolved.id !== normalizedContactId) {
          throw new BadRequestException(
            `Salesforce Contact ${normalizedContactId} email ${email} is not uniquely resolvable`,
          );
        }

        return {
          email,
          sourceId: normalizedContactId,
        };
      })();
      context.exportContactsById.set(normalizedContactId, promise);
    }

    return promise;
  }

  async loadAclSnapshot(context: MetadataResolutionContext): Promise<AclConfigSnapshot> {
    if (!context.aclSnapshotPromise) {
      context.aclSnapshotPromise = this.aclConfigRepository.loadSnapshot();
    }

    return context.aclSnapshotPromise;
  }

  async resolveConeIdByCode(
    coneCode: string,
    coneIdByCode: Map<string, string>,
  ): Promise<string> {
    const normalizedConeCode = requireString(coneCode, 'coneCode is required');
    const cachedId = coneIdByCode.get(normalizedConeCode);
    if (cachedId) {
      return cachedId;
    }

    const row = await this.prisma.visibilityCone.findUnique({
      where: { code: normalizedConeCode },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException(`Visibility cone ${normalizedConeCode} not found`);
    }

    coneIdByCode.set(normalizedConeCode, row.id);
    return row.id;
  }
}
