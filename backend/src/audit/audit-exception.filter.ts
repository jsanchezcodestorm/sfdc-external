import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

import { AuditWriteService } from './audit-write.service';

@Injectable()
@Catch(BadRequestException)
export class AuditExceptionFilter extends BaseExceptionFilter {
  constructor(
    httpAdapterHost: HttpAdapterHost,
    private readonly auditWriteService: AuditWriteService,
  ) {
    super(httpAdapterHost.httpAdapter);
  }

  override async catch(exception: BadRequestException, host: ArgumentsHost): Promise<void> {
    try {
      await this.auditWriteService.recordSecurityEventOrThrow({
        eventType: 'INPUT',
        decision: 'DENY',
        reasonCode: 'INPUT_VALIDATION_FAILED',
        metadata: this.extractExceptionBody(exception),
      });
      super.catch(exception, host);
    } catch (error) {
      super.catch(
        error instanceof ServiceUnavailableException
          ? error
          : new ServiceUnavailableException('Unable to persist security audit event'),
        host,
      );
    }
  }

  private extractExceptionBody(exception: BadRequestException): Record<string, unknown> {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { message: response };
    }

    if (response && typeof response === 'object') {
      return response as Record<string, unknown>;
    }

    return {
      message: exception.message,
    };
  }
}
