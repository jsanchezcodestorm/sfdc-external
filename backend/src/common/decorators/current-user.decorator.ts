import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { SessionUser } from '../../auth/session-user.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: SessionUser }>();
    return request.user;
  }
);
