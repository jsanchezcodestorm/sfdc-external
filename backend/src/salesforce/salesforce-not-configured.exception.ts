import { ServiceUnavailableException } from '@nestjs/common';

export class SalesforceNotConfiguredException extends ServiceUnavailableException {
  constructor() {
    super('Salesforce is not configured');
  }
}
