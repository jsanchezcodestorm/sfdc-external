import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/session-user.interface';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { EvaluateVisibilityDto } from './dto/evaluate-visibility.dto';
import { VisibilityService } from './visibility.service';
import type { VisibilityEvaluation } from './visibility.types';

@Controller('visibility')
@UseGuards(JwtAuthGuard, AclGuard)
export class VisibilityController {
  constructor(private readonly visibilityService: VisibilityService) {}

  @Post('evaluate')
  @AclResource('rest:visibility-debug')
  evaluateVisibility(
    @CurrentUser() user: SessionUser,
    @Body() dto: EvaluateVisibilityDto
  ): Promise<VisibilityEvaluation> {
    return this.visibilityService.evaluateForObject(user, dto.objectApiName);
  }
}
