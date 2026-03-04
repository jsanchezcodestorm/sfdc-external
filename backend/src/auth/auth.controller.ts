import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { SESSION_COOKIE_NAME } from '../app.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { SessionUser } from './session-user.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  async loginWithGoogle(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ user: SessionUser }> {
    const { token, user } = await this.authService.loginWithGoogleIdToken(dto.idToken);

    response.cookie(SESSION_COOKIE_NAME, token, this.authService.getSessionCookieOptions());

    return { user };
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  getSession(@CurrentUser() user: SessionUser): { user: SessionUser } {
    return { user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response): { success: boolean } {
    response.clearCookie(SESSION_COOKIE_NAME, this.authService.getClearCookieOptions());
    return { success: true };
  }
}
