import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ReportFolderAccessMode,
  ReportShareMode,
  ReportShareSubjectType
} from '@prisma/client';

import type { ReportShareGrant } from '../../reports/reports.types';
import type { DashboardShareRecordLike } from '../dashboard-records.types';

@Injectable()
export class DashboardShareCodecService {
  mapShareGrant(share: DashboardShareRecordLike): ReportShareGrant {
    return {
      subjectType: share.subjectType === ReportShareSubjectType.CONTACT ? 'contact' : 'permission',
      subjectId: share.subjectId
    };
  }

  toFolderAccessMode(value: 'personal' | 'shared'): ReportFolderAccessMode {
    return value === 'shared' ? ReportFolderAccessMode.SHARED : ReportFolderAccessMode.PERSONAL;
  }

  fromFolderAccessMode(value: ReportFolderAccessMode): 'personal' | 'shared' {
    return value === ReportFolderAccessMode.SHARED ? 'shared' : 'personal';
  }

  toShareMode(value: 'inherit' | 'restricted' | 'personal'): ReportShareMode {
    switch (value) {
      case 'inherit':
        return ReportShareMode.INHERIT;
      case 'restricted':
        return ReportShareMode.RESTRICTED;
      case 'personal':
        return ReportShareMode.PERSONAL;
    }
  }

  fromShareMode(value: ReportShareMode): 'inherit' | 'restricted' | 'personal' {
    switch (value) {
      case ReportShareMode.INHERIT:
        return 'inherit';
      case ReportShareMode.RESTRICTED:
        return 'restricted';
      case ReportShareMode.PERSONAL:
        return 'personal';
    }
  }

  normalizeFolderAccessMode(value: string | undefined): 'personal' | 'shared' {
    const normalized = value?.toLowerCase() ?? 'personal';
    if (normalized !== 'personal' && normalized !== 'shared') {
      throw new BadRequestException('folder.accessMode is invalid');
    }

    return normalized;
  }

  normalizeShareMode(value: string | undefined): 'inherit' | 'restricted' | 'personal' {
    const normalized = value?.toLowerCase() ?? 'inherit';
    if (normalized !== 'inherit' && normalized !== 'restricted' && normalized !== 'personal') {
      throw new BadRequestException('dashboard.shareMode is invalid');
    }

    return normalized;
  }

  normalizeShareSubjectType(value: string, fieldName: string): 'contact' | 'permission' {
    const normalized = value.trim().toLowerCase();
    if (normalized !== 'contact' && normalized !== 'permission') {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return normalized;
  }

  toShareSubjectType(value: 'contact' | 'permission'): ReportShareSubjectType {
    return value === 'contact' ? ReportShareSubjectType.CONTACT : ReportShareSubjectType.PERMISSION;
  }

  buildShareGrantKey(share: ReportShareGrant): string {
    return `${share.subjectType}:${share.subjectId}`;
  }
}
