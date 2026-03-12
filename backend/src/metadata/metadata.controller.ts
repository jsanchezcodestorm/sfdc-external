import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { CsrfGuard } from '../auth/guards/csrf.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { DeployMetadataPackageDto } from './dto/deploy-metadata-package.dto';
import { ExportMetadataPackageDto } from './dto/export-metadata-package.dto';
import { MetadataAdminService } from './metadata.service';
import type { MetadataDeployResponse, MetadataPreviewResponse } from './metadata.types';

@Controller('metadata')
@UseGuards(JwtAuthGuard, CsrfGuard, AclGuard)
export class MetadataController {
  constructor(private readonly metadataAdminService: MetadataAdminService) {}

  @Post('admin/export')
  @AclResource('rest:metadata-admin')
  async exportPackage(
    @Body() dto: ExportMetadataPackageDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const exported = await this.metadataAdminService.exportPackage(dto.sections);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.filename}"`,
    );

    return new StreamableFile(exported.buffer);
  }

  @Post('admin/preview')
  @AclResource('rest:metadata-admin')
  @UseInterceptors(FileInterceptor('package'))
  previewPackage(@UploadedFile() file?: { buffer?: Buffer }): Promise<MetadataPreviewResponse> {
    if (!file?.buffer) {
      throw new BadRequestException('Metadata package zip is required');
    }

    return this.metadataAdminService.previewPackage(file.buffer);
  }

  @Post('admin/deploy')
  @AclResource('rest:metadata-admin')
  @UseInterceptors(FileInterceptor('package'))
  deployPackage(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
    @Body() dto: DeployMetadataPackageDto,
  ): Promise<MetadataDeployResponse> {
    if (!file?.buffer) {
      throw new BadRequestException('Metadata package zip is required');
    }

    return this.metadataAdminService.deployPackage(
      file.buffer,
      dto.packageHash,
      dto.targetFingerprint,
    );
  }
}
