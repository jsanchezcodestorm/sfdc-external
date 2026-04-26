import type { SalesforceFieldDescribe } from './entity-admin-config.types';

export type BootstrapFieldContext = 'list' | 'detail' | 'form' | 'search';

const TEXT_SEARCH_TYPES = new Set([
  'string',
  'textarea',
  'longtextarea',
  'richtextarea',
  'phone',
  'email',
  'url',
  'id',
  'reference',
  'picklist',
  'multipicklist'
]);

export class EntityBootstrapFieldRanker {
  rank(
    fields: SalesforceFieldDescribe[],
    context: BootstrapFieldContext
  ): SalesforceFieldDescribe[] {
    const scored = fields
      .filter((field) => field.name.length > 0)
      .filter((field) => {
        if (context === 'search') {
          return field.filterable && TEXT_SEARCH_TYPES.has(field.type.toLowerCase());
        }

        return true;
      })
      .map((field) => ({
        field,
        score: this.computeFieldScore(field, context)
      }))
      .sort((left, right) => {
        if (left.score !== right.score) {
          return left.score - right.score;
        }

        return left.field.name.localeCompare(right.field.name, 'en', { sensitivity: 'base' });
      });

    return scored.map((entry) => entry.field);
  }

  isManagedFormField(field: SalesforceFieldDescribe): boolean {
    return (
      field.name === 'Id' ||
      this.isSystemField(field.name.toLowerCase()) ||
      this.isAuditField(field.name.toLowerCase()) ||
      field.calculated === true ||
      field.autoNumber === true
    );
  }

  private computeFieldScore(
    field: SalesforceFieldDescribe,
    context: BootstrapFieldContext
  ): number {
    const name = field.name.toLowerCase();
    const label = field.label.toLowerCase();
    const type = field.type.toLowerCase();
    let score = 100;

    if (name === 'id') {
      score -= context === 'detail' ? 5 : 0;
    }

    if (name === 'name') {
      score -= 90;
    }

    if (
      name.endsWith('name') ||
      label.includes('name') ||
      name.includes('subject') ||
      name.includes('title')
    ) {
      score -= 55;
    }

    if (name.includes('status')) {
      score -= 50;
    }

    if (name.includes('stage')) {
      score -= 48;
    }

    if (name.includes('type')) {
      score -= 42;
    }

    if (name.includes('email')) {
      score -= 40;
    }

    if (name.includes('phone') || name.includes('mobile') || name.includes('fax')) {
      score -= 38;
    }

    if (name.includes('amount') || name.includes('total') || name.includes('value')) {
      score -= 30;
    }

    if (
      name.includes('date') ||
      name.includes('deadline') ||
      name.includes('start') ||
      name.includes('end') ||
      name.includes('close')
    ) {
      score -= 26;
    }

    if (type === 'date') {
      score -= context === 'detail' ? 18 : 12;
    } else if (type === 'datetime') {
      score -= context === 'detail' ? 14 : 8;
    } else if (type === 'email' || type === 'phone') {
      score -= 20;
    } else if (type === 'string' || type === 'picklist') {
      score -= 16;
    } else if (type === 'textarea' || type === 'longtextarea' || type === 'richtextarea') {
      score += context === 'list' ? 32 : 10;
    } else if (type === 'reference') {
      score += 24;
    } else if (type === 'boolean') {
      score += context === 'form' ? 8 : 18;
    }

    if (name !== 'id' && name.endsWith('id')) {
      score += 34;
    }

    if (this.isSystemField(name)) {
      score += 70;
    } else if (this.isAuditField(name)) {
      score += 30;
    }

    if (context === 'form') {
      if (field.createable || field.updateable) {
        score -= 12;
      }

      if (!field.nillable) {
        score -= 8;
      }
    }

    if (context === 'search' && type === 'reference') {
      score += 8;
    }

    return score;
  }

  private isSystemField(name: string): boolean {
    return [
      'createdbyid',
      'lastmodifiedbyid',
      'systemmodstamp',
      'isdeleted',
      'ownerid',
      'recordtypeid',
      'lastreferenceddate',
      'lastvieweddate'
    ].includes(name);
  }

  private isAuditField(name: string): boolean {
    return ['createddate', 'lastmodifieddate', 'lastactivitydate'].includes(name);
  }
}
