import { BadRequestException, Injectable } from '@nestjs/common';

import type { QueryTemplate, QueryTemplateParams } from '../query.types';

@Injectable()
export class QueryTemplateCompiler {
  compile(template: QueryTemplate, params: QueryTemplateParams): string {
    const mergedParams: QueryTemplateParams = {
      ...(template.defaultParams ?? {}),
      ...params
    };

    return template.soql.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token: string) => {
      if (!Object.hasOwn(mergedParams, token)) {
        throw new BadRequestException(`Missing template parameter: ${token}`);
      }

      return this.serializeToken(token, mergedParams[token], template.maxLimit ?? 200);
    });
  }

  private serializeToken(token: string, value: unknown, maxLimit: number): string {
    if (token.toLowerCase().includes('limit')) {
      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maxLimit) {
        throw new BadRequestException(`Invalid ${token}; accepted range is 1..${maxLimit}`);
      }

      return String(parsed);
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException(`Invalid numeric value for ${token}`);
      }

      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    if (typeof value === 'string') {
      const escaped = value.replace(/'/g, "\\'");
      return `'${escaped}'`;
    }

    throw new BadRequestException(`Invalid value for ${token}`);
  }
}
