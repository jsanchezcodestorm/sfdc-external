import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { SESSION_COOKIE_NAME } from '../app.constants';
import { AuditWriteService } from '../audit/audit-write.service';
import { RequestContextService } from '../audit/request-context.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { SessionUser } from './session-user.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditWriteService: AuditWriteService,
    private readonly requestContextService: RequestContextService
  ) {}

  @Post('google')
  async loginWithGoogle(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ user: SessionUser }> {
    try {
      const { token, user } = await this.authService.loginWithGoogleIdToken(dto.idToken);
      this.requestContextService.setUser(user);
      await this.auditWriteService.recordSecurityEventOrThrow({
        contactId: user.sub,
        eventType: 'AUTH',
        decision: 'ALLOW',
        reasonCode: 'GOOGLE_LOGIN_SUCCESS',
        metadata: {
          provider: 'google'
        }
      });

      response.cookie(SESSION_COOKIE_NAME, token, this.authService.getSessionCookieOptions());

      return { user };
    } catch (error) {
      await this.auditWriteService.recordSecurityEventOrThrow({
        eventType: 'AUTH',
        decision: 'DENY',
        reasonCode: 'GOOGLE_LOGIN_FAILED',
        metadata: {
          provider: 'google',
          error: error instanceof Error ? error.message : 'unknown error'
        }
      });
      throw error;
    }
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  getSession(@CurrentUser() user: SessionUser): { user: SessionUser } {
    return { user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response): { success: boolean } {
    response.clearCookie(SESSION_COOKIE_NAME, this.authService.getClearCookieOptions());
    void this.auditWriteService.recordSecurityEventBestEffort({
      eventType: 'AUTH',
      decision: 'ALLOW',
      reasonCode: 'LOGOUT'
    });
    return { success: true };
  }
}
