import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SALESFORCE_ID_PATTERN = /^[A-Za-z0-9]{15,18}$/;
const SALESFORCE_OBJECT_API_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SALESFORCE_FIELD_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

@Injectable()
export class VisibilityAdminInputNormalizerService {
  normalizeOptionalContactId(value: unknown, fieldName: string): string | undefined {
    const normalized = this.asOptionalString(value);
    if (!normalized) {
      return undefined;
    }

    if (!SALESFORCE_ID_PATTERN.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be a valid Salesforce id`);
    }

    return normalized;
  }

  normalizePermissionsArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('permissions must be an array');
    }

    return value
      .map((entry, index) => {
        if (typeof entry !== 'string') {
          throw new BadRequestException(`permissions[${index}] must be a string`);
        }

        const normalized = entry.trim().toUpperCase();
        if (!normalized) {
          throw new BadRequestException(`permissions[${index}] must be non-empty`);
        }

        return normalized;
      })
      .filter((entry, index, source) => source.indexOf(entry) === index);
  }

  normalizeRequestedFields(value: unknown): string[] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('requestedFields must be an array');
    }

    return value.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new BadRequestException(`requestedFields[${index}] must be a string`);
      }

      const normalized = entry.trim();
      if (!normalized) {
        throw new BadRequestException(`requestedFields[${index}] must be non-empty`);
      }

      return normalized;
    });
  }

  normalizeRequiredRequestedFields(value: unknown): string[] {
    const requestedFields = this.normalizeRequestedFields(value);
    if (!requestedFields || requestedFields.length === 0) {
      throw new BadRequestException('requestedFields must be a non-empty array');
    }

    return requestedFields
      .map((fieldName, index) => {
        if (!SALESFORCE_FIELD_PATH_PATTERN.test(fieldName)) {
          throw new BadRequestException(
            `requestedFields[${index}] must be a valid Salesforce field path`,
          );
        }

        return fieldName;
      })
      .filter((fieldName, index, source) => source.indexOf(fieldName) === index);
  }

  normalizeDebugContactSuggestionLimit(value: unknown): number {
    if (value === undefined || value === null) {
      return 8;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 8) {
      throw new BadRequestException('limit must be an integer between 1 and 8');
    }

    return value;
  }

  normalizePreviewLimit(value: unknown): number {
    if (value === undefined || value === null) {
      return 10;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 25) {
      throw new BadRequestException('limit must be an integer between 1 and 25');
    }

    return value;
  }

  normalizePreviewObjectApiName(value: string, fieldName: string): string {
    if (!SALESFORCE_OBJECT_API_NAME_PATTERN.test(value)) {
      throw new BadRequestException(`${fieldName} must be a valid Salesforce object API name`);
    }

    return value;
  }

  requireString(value: unknown, message: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(message);
    }

    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  assertUuid(value: string, fieldName: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(`${fieldName} must be a valid UUID`);
    }
  }

  rethrowUniqueConflict(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }

    throw error;
  }
}
