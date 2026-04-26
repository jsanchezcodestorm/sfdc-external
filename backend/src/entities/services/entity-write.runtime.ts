import type { AuditWriteService } from '../../audit/audit-write.service';
import type { SessionUser } from '../../auth/session-user.interface';
import type { SalesforceService } from '../../salesforce/salesforce.service';

import type { EntityRuntimeOperations } from '../entities.runtime.operations';
import {
  ENTITY_CREATE_QUERY_KIND,
  ENTITY_DELETE_PREFLIGHT_QUERY_KIND,
  ENTITY_DELETE_QUERY_KIND,
  ENTITY_UPDATE_PREFLIGHT_QUERY_KIND,
  ENTITY_UPDATE_QUERY_KIND
} from '../entities.runtime.types';

export class EntityWriteRuntime {
  constructor(
    private readonly auditWriteService: AuditWriteService,
    private readonly salesforceService: SalesforceService,
    private readonly operations: EntityRuntimeOperations
  ) {}

  async createEntityRecord(
    user: SessionUser,
    entityId: string,
    payload: unknown
  ): Promise<Record<string, unknown>> {
    const entityConfig = await this.operations.loadEntityConfig(entityId);
    const visibility = await this.operations.authorizeEntityWriteAccess(
      user,
      entityId,
      entityConfig.objectApiName,
      ENTITY_CREATE_QUERY_KIND
    );
    const values = await this.operations.normalizeWritePayload(entityConfig, payload, 'create');
    await this.operations.recordWriteVisibilityAudit(visibility, ENTITY_CREATE_QUERY_KIND);
    const auditId = await this.auditWriteService.createApplicationIntentOrThrow({
      contactId: user.sub,
      action: ENTITY_CREATE_QUERY_KIND,
      targetType: 'entity-record',
      targetId: entityId,
      objectApiName: entityConfig.objectApiName,
      payload: values,
      metadata: {
        entityId
      }
    });

    try {
      const result = await this.salesforceService.createRecord(entityConfig.objectApiName, values);
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'SUCCESS',
        result: {
          id: typeof result.id === 'string' ? result.id : undefined,
          success: result.success === true
        }
      });
      return result;
    } catch (error) {
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'FAILURE',
        errorCode: this.auditWriteService.normalizeErrorCode(error),
        result: {
          message: error instanceof Error ? error.message : 'unknown error'
        }
      });
      throw error;
    }
  }

  async updateEntityRecord(
    user: SessionUser,
    entityId: string,
    recordId: string,
    payload: unknown
  ): Promise<Record<string, unknown>> {
    this.operations.assertSalesforceRecordId(recordId);
    const entityConfig = await this.operations.loadEntityConfig(entityId);
    const visibility = await this.operations.authorizeEntityWriteAccess(
      user,
      entityId,
      entityConfig.objectApiName,
      ENTITY_UPDATE_QUERY_KIND
    );
    await this.operations.assertRecordInWriteScope(
      user,
      entityId,
      entityConfig.objectApiName,
      recordId,
      visibility,
      ENTITY_UPDATE_PREFLIGHT_QUERY_KIND,
      'update'
    );
    const values = await this.operations.normalizeWritePayload(entityConfig, payload, 'update');
    await this.operations.recordWriteVisibilityAudit(visibility, ENTITY_UPDATE_QUERY_KIND);
    const auditId = await this.auditWriteService.createApplicationIntentOrThrow({
      contactId: user.sub,
      action: ENTITY_UPDATE_QUERY_KIND,
      targetType: 'entity-record',
      targetId: recordId,
      objectApiName: entityConfig.objectApiName,
      recordId,
      payload: values,
      metadata: {
        entityId
      }
    });

    try {
      const result = await this.salesforceService.updateRecord(entityConfig.objectApiName, recordId, values);
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'SUCCESS',
        result: {
          id: typeof result.id === 'string' ? result.id : recordId,
          success: result.success === true
        }
      });
      return result;
    } catch (error) {
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'FAILURE',
        errorCode: this.auditWriteService.normalizeErrorCode(error),
        result: {
          message: error instanceof Error ? error.message : 'unknown error'
        }
      });
      throw error;
    }
  }

  async deleteEntityRecord(user: SessionUser, entityId: string, recordId: string): Promise<void> {
    this.operations.assertSalesforceRecordId(recordId);
    const entityConfig = await this.operations.loadEntityConfig(entityId);
    const visibility = await this.operations.authorizeEntityWriteAccess(
      user,
      entityId,
      entityConfig.objectApiName,
      ENTITY_DELETE_QUERY_KIND
    );
    await this.operations.assertRecordInWriteScope(
      user,
      entityId,
      entityConfig.objectApiName,
      recordId,
      visibility,
      ENTITY_DELETE_PREFLIGHT_QUERY_KIND,
      'delete'
    );
    await this.operations.recordWriteVisibilityAudit(visibility, ENTITY_DELETE_QUERY_KIND);
    const auditId = await this.auditWriteService.createApplicationIntentOrThrow({
      contactId: user.sub,
      action: ENTITY_DELETE_QUERY_KIND,
      targetType: 'entity-record',
      targetId: recordId,
      objectApiName: entityConfig.objectApiName,
      recordId,
      metadata: {
        entityId
      }
    });

    try {
      await this.salesforceService.deleteRecord(entityConfig.objectApiName, recordId);
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'SUCCESS',
        result: {
          id: recordId,
          success: true
        }
      });
    } catch (error) {
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'FAILURE',
        errorCode: this.auditWriteService.normalizeErrorCode(error),
        result: {
          message: error instanceof Error ? error.message : 'unknown error'
        }
      });
      throw error;
    }
  }
}
