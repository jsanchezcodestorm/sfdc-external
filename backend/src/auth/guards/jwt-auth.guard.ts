import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { SESSION_COOKIE_NAME } from '../../app.constants';
import { AuditWriteService } from '../../audit/audit-write.service';
import { RequestContextService } from '../../audit/request-context.service';
import { AuthService } from '../auth.service';
import type { SessionUser } from '../session-user.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly auditWriteService: AuditWriteService,
    private readonly requestContextService: RequestContextService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      cookies?: Record<string, string>;
      user?: SessionUser;
    }>();

    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (!token) {
      await this.auditWriteService.recordSecurityEventOrThrow({
        eventType: 'SESSION',
        decision: 'DENY',
        reasonCode: 'SESSION_MISSING'
      });
      throw new UnauthorizedException('Missing session cookie');
    }

    try {
      request.user = await this.authService.verifySessionToken(token);
      this.requestContextService.setUser(request.user);
    } catch (error) {
      await this.auditWriteService.recordSecurityEventOrThrow({
        eventType: 'SESSION',
        decision: 'DENY',
        reasonCode: 'SESSION_INVALID'
      });
      throw error;
    }

    return true;
  }
}
