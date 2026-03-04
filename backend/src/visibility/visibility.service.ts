import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { SessionUser } from '../auth/session-user.interface';
import { PrismaService } from '../prisma/prisma.service';

import type { VisibilityContext, VisibilityEvaluation } from './visibility.types';

@Injectable()
export class VisibilityService {
  private readonly logger = new Logger(VisibilityService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService
  ) {}

  async evaluate(context: VisibilityContext): Promise<VisibilityEvaluation> {
    const policyVersion = await this.getPolicyVersion();
    const bootstrapAllow = this.configService.get<string>('VISIBILITY_BOOTSTRAP_ALLOW', 'false') === 'true';

    if (!bootstrapAllow) {
      this.logger.debug(`Visibility deny-by-default for ${context.objectApiName} user=${context.user.sub}`);

      return {
        decision: 'DENY',
        reasonCode: 'NO_ALLOW_RULE',
        policyVersion,
        objectApiName: context.objectApiName,
        contactId: context.user.sub,
        appliedCones: [],
        appliedRules: []
      };
    }

    return {
      decision: 'ALLOW',
      reasonCode: 'BOOTSTRAP_ALLOW',
      policyVersion,
      objectApiName: context.objectApiName,
      contactId: context.user.sub,
      appliedCones: [],
      appliedRules: []
    };
  }

  async evaluateForObject(user: SessionUser, objectApiName: string): Promise<VisibilityEvaluation> {
    return this.evaluate({
      user,
      objectApiName
    });
  }

  private async getPolicyVersion(): Promise<number> {
    try {
      const meta = await this.prismaService.visibilityPolicyMeta.findUnique({
        where: { id: 1 }
      });

      return Number(meta?.policyVersion ?? 1n);
    } catch {
      return 1;
    }
  }
}
