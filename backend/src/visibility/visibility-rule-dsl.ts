import { BadRequestException } from '@nestjs/common';

export const VISIBILITY_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const MAX_DEPTH = 6;
const MAX_NODES = 100;
const MAX_GROUP_CHILDREN = 20;
const MAX_IN_VALUES = 200;
const MAX_STRING_LENGTH = 255;

const OPERATORS = new Set([
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'IN',
  'NOT IN',
  'LIKE',
  'STARTS_WITH',
  'CONTAINS',
  'IS_NULL',
  'IS_NOT_NULL',
] as const);

export type VisibilityScalar = string | number | boolean | null;
export type VisibilityPredicateOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'IN'
  | 'NOT IN'
  | 'LIKE'
  | 'STARTS_WITH'
  | 'CONTAINS'
  | 'IS_NULL'
  | 'IS_NOT_NULL';

export type VisibilityPredicateNode = {
  field: string;
  op: VisibilityPredicateOperator;
  value?: VisibilityScalar | VisibilityScalar[];
};

export type VisibilityAllNode = {
  all: VisibilityRuleNode[];
};

export type VisibilityAnyNode = {
  any: VisibilityRuleNode[];
};

export type VisibilityNotNode = {
  not: VisibilityRuleNode;
};

export type VisibilityRuleNode =
  | VisibilityPredicateNode
  | VisibilityAllNode
  | VisibilityAnyNode
  | VisibilityNotNode;

type NormalizeState = {
  nodeCount: number;
};

export function normalizeVisibilityRuleNode(value: unknown): VisibilityRuleNode {
  return normalizeNode(value, 'condition', 1, { nodeCount: 0 });
}

export function normalizeVisibilityFieldList(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException(`${fieldName} must be an array of field paths`);
  }

  const normalized = value
    .map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new BadRequestException(`${fieldName}[${index}] must be a string`);
      }

      const field = entry.trim();
      if (!VISIBILITY_FIELD_PATTERN.test(field)) {
        throw new BadRequestException(`${fieldName}[${index}] is not a valid field path`);
      }

      return field;
    })
    .filter((entry, index, source) => source.indexOf(entry) === index);

  return normalized.length > 0 ? normalized : undefined;
}

export function compileVisibilityRuleNode(node: VisibilityRuleNode): string {
  if (isAllNode(node)) {
    return `(${node.all.map((entry) => compileVisibilityRuleNode(entry)).join(' AND ')})`;
  }

  if (isAnyNode(node)) {
    return `(${node.any.map((entry) => compileVisibilityRuleNode(entry)).join(' OR ')})`;
  }

  if (isNotNode(node)) {
    return `(NOT ${compileVisibilityRuleNode(node.not)})`;
  }

  const field = node.field;
  const operator = node.op;

  if (operator === 'IS_NULL') {
    return `${field} = NULL`;
  }

  if (operator === 'IS_NOT_NULL') {
    return `${field} != NULL`;
  }

  if (operator === 'STARTS_WITH') {
    return `${field} LIKE ${serializeScalar(`${String(node.value ?? '')}%`)}`;
  }

  if (operator === 'CONTAINS') {
    return `${field} LIKE ${serializeScalar(`%${String(node.value ?? '')}%`)}`;
  }

  if (operator === 'IN' || operator === 'NOT IN') {
    const values = Array.isArray(node.value) ? node.value : [];
    return `${field} ${operator} (${values.map((entry) => serializeScalar(entry)).join(', ')})`;
  }

  const predicateValue = (node as VisibilityPredicateNode).value;
  if (Array.isArray(predicateValue)) {
    throw new BadRequestException(`Operator ${operator} does not accept an array value`);
  }

  return `${field} ${operator} ${serializeScalar(predicateValue ?? null)}`;
}

export function matchesVisibilityFieldPath(candidate: string, ruleFieldPath: string): boolean {
  return candidate === ruleFieldPath || candidate.startsWith(`${ruleFieldPath}.`);
}

function normalizeNode(
  value: unknown,
  fieldName: string,
  depth: number,
  state: NormalizeState,
): VisibilityRuleNode {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new BadRequestException(`${fieldName} must be an object`);
  }

  if (depth > MAX_DEPTH) {
    throw new BadRequestException(`${fieldName} exceeds max depth ${MAX_DEPTH}`);
  }

  state.nodeCount += 1;
  if (state.nodeCount > MAX_NODES) {
    throw new BadRequestException(`${fieldName} exceeds max node count ${MAX_NODES}`);
  }

  const input = value as Record<string, unknown>;

  if (Object.hasOwn(input, 'all')) {
    return {
      all: normalizeChildren(input.all, `${fieldName}.all`, depth, state),
    };
  }

  if (Object.hasOwn(input, 'any')) {
    return {
      any: normalizeChildren(input.any, `${fieldName}.any`, depth, state),
    };
  }

  if (Object.hasOwn(input, 'not')) {
    return {
      not: normalizeNode(input.not, `${fieldName}.not`, depth + 1, state),
    };
  }

  const field = normalizeFieldPath(input.field, `${fieldName}.field`);
  const operator = normalizeOperator(input.op, `${fieldName}.op`);

  if (operator === 'IS_NULL' || operator === 'IS_NOT_NULL') {
    if (Object.hasOwn(input, 'value')) {
      throw new BadRequestException(`${fieldName}.value is not allowed for ${operator}`);
    }

    return {
      field,
      op: operator,
    };
  }

  if (!Object.hasOwn(input, 'value')) {
    throw new BadRequestException(`${fieldName}.value is required`);
  }

  if (operator === 'IN' || operator === 'NOT IN') {
    if (!Array.isArray(input.value) || input.value.length === 0) {
      throw new BadRequestException(`${fieldName}.value must be a non-empty array`);
    }

    if (input.value.length > MAX_IN_VALUES) {
      throw new BadRequestException(`${fieldName}.value exceeds max cardinality ${MAX_IN_VALUES}`);
    }

    return {
      field,
      op: operator,
      value: input.value.map((entry, index) =>
        normalizeScalar(entry, `${fieldName}.value[${index}]`),
      ),
    };
  }

  return {
    field,
    op: operator,
    value: normalizeScalar(input.value, `${fieldName}.value`),
  };
}

function normalizeChildren(
  value: unknown,
  fieldName: string,
  depth: number,
  state: NormalizeState,
): VisibilityRuleNode[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${fieldName} must be an array`);
  }

  if (value.length === 0) {
    throw new BadRequestException(`${fieldName} must contain at least one rule`);
  }

  if (value.length > MAX_GROUP_CHILDREN) {
    throw new BadRequestException(`${fieldName} exceeds max children ${MAX_GROUP_CHILDREN}`);
  }

  return value.map((entry, index) => normalizeNode(entry, `${fieldName}[${index}]`, depth + 1, state));
}

function normalizeFieldPath(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (!VISIBILITY_FIELD_PATTERN.test(normalized)) {
    throw new BadRequestException(`${fieldName} is not a valid field path`);
  }

  return normalized;
}

function normalizeOperator(value: unknown, fieldName: string): VisibilityPredicateOperator {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string`);
  }

  const normalized = value.trim().toUpperCase() as VisibilityPredicateOperator;
  if (!OPERATORS.has(normalized)) {
    throw new BadRequestException(`${fieldName} is not a supported operator`);
  }

  return normalized;
}

function normalizeScalar(value: unknown, fieldName: string): VisibilityScalar {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      throw new BadRequestException(`${fieldName} exceeds max string length ${MAX_STRING_LENGTH}`);
    }

    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new BadRequestException(`${fieldName} must be a finite number`);
    }

    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  throw new BadRequestException(`${fieldName} must be a scalar value`);
}

function serializeScalar(value: VisibilityScalar): string {
  if (value === null) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function isAllNode(node: VisibilityRuleNode): node is VisibilityAllNode {
  return Object.hasOwn(node, 'all');
}

function isAnyNode(node: VisibilityRuleNode): node is VisibilityAnyNode {
  return Object.hasOwn(node, 'any');
}

function isNotNode(node: VisibilityRuleNode): node is VisibilityNotNode {
  return Object.hasOwn(node, 'not');
}
