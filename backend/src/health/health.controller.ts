import { Controller, Get } from '@nestjs/common';

import { HealthService, type HealthResponse } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  health(): Promise<HealthResponse> {
    return this.healthService.getHealth();
  }
}
