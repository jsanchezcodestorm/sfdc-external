import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { OIDC_FLOW_COOKIE_NAME, SESSION_COOKIE_NAME } from '../app.constants';
import { AuditWriteService } from '../audit/audit-write.service';
import { RequestContextService } from '../audit/request-context.service';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { AuthProviderAdminService } from './auth-provider-admin.service';
import { AuthService } from './auth.service';
import type {
  AuthAdminProviderDetailResponse,
  AuthAdminProviderResponse,
  AuthAdminProvidersResponse,
  AuthProvidersResponse,
  AuthSessionResponse,
  LocalCredentialAdminListResponse,
  LocalCredentialAdminResponse
} from './auth.types';
import { CsrfService } from './csrf.service';
import { PasswordLoginDto } from './dto/password-login.dto';
import { UpdateAuthProviderAdminDto } from './dto/update-auth-provider-admin.dto';
import { UpsertLocalCredentialDto } from './dto/upsert-local-credential.dto';
import { CsrfGuard } from './guards/csrf.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalCredentialAdminService } from './local-credential-admin.service';
import type { SessionUser } from './session-user.interface';

@Controller('auth')
@UseGuards(CsrfGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authProviderAdminService: AuthProviderAdminService,
    private readonly localCredentialAdminService: LocalCredentialAdminService,
    private readonly csrfService: CsrfService,
    private readonly auditWriteService: AuditWriteService,
    private readonly requestContextService: RequestContextService
  ) {}

  @Get('providers')
  listProviders(): Promise<AuthProvidersResponse> {
    return this.authService.listPublicProviders();
  }

  @Get('oidc/:providerId/start')
  async startOidcLogin(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const { redirectUrl, flowToken } = await this.authService.createOidcLoginStart(
      providerId,
      request
    );

    response.cookie(
      OIDC_FLOW_COOKIE_NAME,
      flowToken,
      this.authService.getOidcFlowCookieOptions(providerId)
    );
    response.redirect(redirectUrl);
  }

  @Get('oidc/:providerId/callback')
  async completeOidcLogin(
    @Param('providerId') providerId: string,
    @Query()
    query: {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    },
    @Req()
    request: {
      cookies?: Record<string, string>;
    },
    @Res() response: Response
  ): Promise<void> {
    response.clearCookie(
      OIDC_FLOW_COOKIE_NAME,
      this.authService.getClearOidcFlowCookieOptions(providerId)
    );

    try {
      const { token, user } = await this.authService.completeOidcLogin(providerId, {
        flowToken: request.cookies?.[OIDC_FLOW_COOKIE_NAME],
        state: query.state,
        code: query.code,
        error: query.error,
        errorDescription: query.error_description
      });
      this.requestContextService.setUser(user);
      await this.auditWriteService.recordSecurityEventOrThrow({
        contactId: user.sub,
        eventType: 'AUTH',
        decision: 'ALLOW',
        reasonCode: 'LOGIN_SUCCESS',
        metadata: {
          provider: providerId,
          method: 'oidc'
        }
      });

      response.cookie(SESSION_COOKIE_NAME, token, this.authService.getSessionCookieOptions());
      this.csrfService.issueToken(response);
      response.redirect(this.authService.getFrontendLoginRedirect());
    } catch (error) {
      await this.auditWriteService.recordSecurityEventOrThrow({
        eventType: 'AUTH',
        decision: 'DENY',
        reasonCode: 'LOGIN_FAILED',
        metadata: {
          provider: providerId,
          method: 'oidc',
          error: error instanceof Error ? error.message : 'unknown error'
        }
      });

      response.redirect(
        this.authService.getFrontendLoginRedirect({
          authError:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : 'Login non riuscito'
        })
      );
    }
  }

  @Post('login/password')
  async loginWithPassword(
    @Body() dto: PasswordLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthSessionResponse> {
    try {
      const { token, user } = await this.authService.loginWithPassword(
        dto.username,
        dto.password,
        request.ip || ''
      );
      this.requestContextService.setUser(user);
      await this.auditWriteService.recordSecurityEventOrThrow({
        contactId: user.sub,
        eventType: 'AUTH',
        decision: 'ALLOW',
        reasonCode: 'LOGIN_SUCCESS',
        metadata: {
          provider: 'local',
          method: 'local'
        }
      });

      response.cookie(SESSION_COOKIE_NAME, token, this.authService.getSessionCookieOptions());
      const csrfToken = this.csrfService.issueToken(response);

      return { user, csrfToken };
    } catch (error) {
      await this.auditWriteService.recordSecurityEventOrThrow({
        eventType: 'AUTH',
        decision: 'DENY',
        reasonCode: 'LOGIN_FAILED',
        metadata: {
          provider: 'local',
          method: 'local',
          username: dto.username,
          error: error instanceof Error ? error.message : 'unknown error'
        }
      });
      throw error;
    }
  }

  @Get('csrf')
  getCsrfToken(@Res({ passthrough: true }) response: Response): { csrfToken: string } {
    const csrfToken = this.csrfService.issueToken(response);
    return { csrfToken };
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  async getSession(
    @Req()
    request: {
      cookies?: Record<string, string>;
      user?: SessionUser;
    },
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthSessionResponse> {
    const sessionToken = request.cookies?.[SESSION_COOKIE_NAME];

    if (!sessionToken) {
      throw new UnauthorizedException('Missing session cookie');
    }

    const user = await this.authService.refreshSessionUser(sessionToken);
    request.user = user;
    this.requestContextService.setUser(user);

    const token = this.authService.issueSessionToken(user);
    response.cookie(SESSION_COOKIE_NAME, token, this.authService.getSessionCookieOptions());
    const csrfToken = this.csrfService.issueToken(response);
    return { user, csrfToken };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response): { success: boolean } {
    this.csrfService.clearToken(response);
    response.clearCookie(SESSION_COOKIE_NAME, this.authService.getClearCookieOptions());
    void this.auditWriteService.recordSecurityEventBestEffort({
      eventType: 'AUTH',
      decision: 'ALLOW',
      reasonCode: 'LOGOUT'
    });
    return { success: true };
  }

  @Get('admin/providers')
  @UseGuards(JwtAuthGuard, AclGuard)
  @AclResource('rest:auth-admin')
  listAdminProviders(): Promise<AuthAdminProvidersResponse> {
    return this.authProviderAdminService.listProviders();
  }

  @Get('admin/providers/:providerId')
  @UseGuards(JwtAuthGuard, AclGuard)
  @AclResource('rest:auth-admin')
  getAdminProvider(
    @Param('providerId') providerId: string,
    @Req() request: Request
  ): Promise<AuthAdminProviderDetailResponse> {
    return this.authProviderAdminService.getProvider(providerId, request);
  }

  @Put('admin/providers/:providerId')
  @UseGuards(JwtAuthGuard, AclGuard)
  @AclResource('rest:auth-admin')
  updateAdminProvider(
    @Param('providerId') providerId: string,
    @Body() dto: UpdateAuthProviderAdminDto
  ): Promise<AuthAdminProviderResponse> {
    return this.authProviderAdminService.updateProvider(providerId, dto.provider);
  }

  @Get('admin/local-credentials')
  @UseGuards(JwtAuthGuard, AclGuard)
  @AclResource('rest:auth-admin')
  listLocalCredentials(): Promise<LocalCredentialAdminListResponse> {
    return this.localCredentialAdminService.listCredentials();
  }

  @Put('admin/local-credentials/:contactId')
  @UseGuards(JwtAuthGuard, AclGuard)
  @AclResource('rest:auth-admin')
  upsertLocalCredential(
    @Param('contactId') contactId: string,
    @Body() dto: UpsertLocalCredentialDto
  ): Promise<LocalCredentialAdminResponse> {
    return this.localCredentialAdminService.upsertCredential(contactId, dto.credential);
  }

  @Delete('admin/local-credentials/:contactId')
  @UseGuards(JwtAuthGuard, AclGuard)
  @AclResource('rest:auth-admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLocalCredential(@Param('contactId') contactId: string): Promise<void> {
    await this.localCredentialAdminService.deleteCredential(contactId);
  }
}
