import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SalesforceNotConfiguredException } from '../salesforce/salesforce-not-configured.exception';
import { SalesforceService } from '../salesforce/salesforce.service';

type DependencyStatus = 'up' | 'down' | 'not_configured';

type DependencyCheckResult = {
  status: DependencyStatus;
  latencyMs: number;
  error?: string;
};

export type HealthResponse = {
  status: 'ok' | 'degraded';
  timestamp: string;
  checks: {
    postgres: DependencyCheckResult;
    salesforce: DependencyCheckResult;
  };
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly salesforceService: SalesforceService
  ) {}

  async getHealth(): Promise<HealthResponse> {
    const [postgres, salesforce] = await Promise.all([
      this.checkPostgres(),
      this.checkSalesforce()
    ]);

    const status = postgres.status === 'up' && salesforce.status === 'up' ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        postgres,
        salesforce
      }
    };
  }

  private async checkPostgres(): Promise<DependencyCheckResult> {
    const startedAt = Date.now();

    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return {
        status: 'up',
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: this.normalizeError(error)
      };
    }
  }

  private async checkSalesforce(): Promise<DependencyCheckResult> {
    const startedAt = Date.now();

    try {
      await this.salesforceService.ping();
      return {
        status: 'up',
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      if (error instanceof SalesforceNotConfiguredException) {
        return {
          status: 'not_configured',
          latencyMs: Date.now() - startedAt,
          error: this.normalizeError(error)
        };
      }

      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: this.normalizeError(error)
      };
    }
  }

  private normalizeError(error: unknown): string {
    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return 'Dependency unavailable';
  }
}
