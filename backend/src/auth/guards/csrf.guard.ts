import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { AuditWriteService } from '../../audit/audit-write.service';
import { CsrfService } from '../csrf.service';
import type { SessionUser } from '../session-user.interface';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly csrfService: CsrfService,
    private readonly auditWriteService: AuditWriteService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      cookies?: Record<string, string>;
      user?: SessionUser;
      header(name: string): string | undefined;
    }>();

    const failure = this.csrfService.validateRequest(request);
    if (!failure) {
      return true;
    }

    await this.auditWriteService.recordSecurityEventOrThrow({
      contactId: request.user?.sub ?? null,
      eventType: 'CSRF',
      decision: 'DENY',
      reasonCode: failure.reasonCode,
      metadata: failure.metadata
    });

    throw new ForbiddenException(failure.message);
  }
}
