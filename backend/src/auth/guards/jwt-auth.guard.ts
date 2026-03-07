import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { SESSION_COOKIE_NAME } from '../../app.constants';
import { AuthService } from '../auth.service';
import type { SessionUser } from '../session-user.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      cookies?: Record<string, string>;
      user?: SessionUser;
    }>();

    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException('Missing session cookie');
    }

    request.user = this.authService.verifySessionToken(token);
    return true;
  }
}
