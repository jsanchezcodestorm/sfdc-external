import {
  renderRecordTemplate,
  resolveFieldValue,
  toLabel,
} from "../entities/entity-helpers";
import type {
  EntityAction,
  EntityColumn,
  EntityRecord,
  PathStatusConfig,
} from "../entities/entity-types";
import type {
  DetailFormDraft,
  RelatedListDraft,
} from "./components/detail-form/detail-form.types";
import type {
  FormFieldDraft,
  FormFormDraft,
} from "./components/form-form/form-form.types";

export type DetailPreviewRelatedList = {
  id: string;
  label: string;
  description?: string;
  entityId?: string;
  objectApiName?: string;
  columns: EntityColumn[];
  actions: EntityAction[];
  rowActions: EntityAction[];
  queryFieldCount: number;
};

export type DetailPreviewSection = {
  title: string;
  fields: Array<{
    label: string;
    field: string | undefined;
    template: string | undefined;
    highlight: boolean | undefined;
    format: "date" | "datetime" | undefined;
  }>;
};

export type DetailPreviewModel = {
  title: string;
  subtitle?: string;
  record: EntityRecord;
  sections: DetailPreviewSection[];
  actions: EntityAction[];
  pathStatus?: PathStatusConfig;
  currentPathStatusValue?: string;
  relatedLists: DetailPreviewRelatedList[];
  warnings: string[];
};

export type FormPreviewModel = {
  createTitle?: string;
  editTitle?: string;
  title: string;
  subtitle?: string;
  values: EntityRecord;
  sections: FormPreviewSection[];
  warnings: string[];
};

export type FormPreviewSection = {
  title: string;
  fields: FormPreviewField[];
};

export type FormPreviewField = {
  field: string | undefined;
  label: string;
  inputType:
    | "text"
    | "email"
    | "tel"
    | "date"
    | "datetime-local"
    | "time"
    | "url"
    | "password"
    | "textarea"
    | "number"
    | "checkbox"
    | "lookup";
  required: boolean | undefined;
  placeholder: string | undefined;
  lookup:
    | {
        searchField: string | undefined;
        prefill: boolean | undefined;
      }
    | undefined;
};

type MockFieldHint = {
  format?: "date" | "datetime";
  inputType?:
    | "text"
    | "email"
    | "tel"
    | "date"
    | "datetime-local"
    | "time"
    | "url"
    | "password"
    | "textarea"
    | "number"
    | "checkbox"
    | "lookup";
  label?: string;
  lookup?: boolean;
};

export function buildDetailPreviewModel(
  draft: DetailFormDraft,
): DetailPreviewModel {
  const warnings: string[] = [];
  validateJsonArray(draft.queryWhereJson, "Detail query.where", warnings);
  validateJsonArray(draft.queryOrderByJson, "Detail query.orderBy", warnings);
  const sections = draft.sections
    .map((section, sectionIndex) => {
      const fields = section.fields
        .filter((field) => hasDetailPreviewField(field))
        .map((field, fieldIndex) => ({
          label:
            normalizeText(field.label) ??
            (normalizeText(field.field)
              ? toLabel(normalizeText(field.field) ?? "")
              : undefined) ??
            normalizeText(field.template) ??
            `Field ${fieldIndex + 1}`,
          field: normalizeText(field.field),
          template: normalizeText(field.template),
          highlight: field.highlight ? true : undefined,
          format:
            field.format === "date" || field.format === "datetime"
              ? field.format
              : undefined,
        }));

      if (fields.length === 0 && !normalizeText(section.title)) {
        return null;
      }

      return {
        title: normalizeText(section.title) ?? `Section ${sectionIndex + 1}`,
        fields,
      };
    })
    .filter((section): section is DetailPreviewSection => section !== null);

  const pathHints = new Map<string, MockFieldHint>();
  const referencedFieldPaths = new Set<string>();

  for (const section of sections) {
    for (const field of section.fields) {
      if (field.field) {
        referencedFieldPaths.add(field.field);
        mergeHint(pathHints, field.field, {
          format: field.format,
          label: field.label,
        });
      }

      if (field.template) {
        for (const token of extractTemplateFieldPaths(field.template)) {
          referencedFieldPaths.add(token);
          mergeHint(pathHints, token, {
            label: field.label,
          });
        }
      }
    }
  }

  if (draft.pathStatusEnabled && normalizeText(draft.pathStatusField)) {
    const pathStatusField = normalizeText(draft.pathStatusField) ?? "";
    referencedFieldPaths.add(pathStatusField);
    mergeHint(pathHints, pathStatusField, {
      label: pathStatusField,
    });
  }

  for (const token of extractTemplateFieldPaths(draft.titleTemplate)) {
    referencedFieldPaths.add(token);
    mergeHint(pathHints, token, {});
  }

  for (const token of extractTemplateFieldPaths(draft.subtitle)) {
    referencedFieldPaths.add(token);
    mergeHint(pathHints, token, {});
  }

  const record = buildMockRecord(referencedFieldPaths, pathHints);
  const actions = safeParseActionsJson(
    draft.actionsJson,
    "Detail actions",
    warnings,
  );
  const pathStatus = buildPathStatusPreview(draft, warnings);
  const currentPathStatusValue = pathStatus?.steps[0]?.value;

  if (pathStatus && currentPathStatusValue) {
    setRecordValue(record, pathStatus.field, currentPathStatusValue);
  }

  const title =
    renderTemplateValue(draft.titleTemplate, record) ??
    normalizeText(draft.fallbackTitle) ??
    "Detail preview";
  const subtitle =
    renderTemplateValue(draft.subtitle, record) ??
    normalizeText(draft.subtitle);
  const relatedLists = draft.relatedLists
    .map((relatedList, index) =>
      buildRelatedListPreview(relatedList, index, warnings),
    )
    .filter((entry): entry is DetailPreviewRelatedList => entry !== null);

  return {
    title,
    subtitle,
    record,
    sections,
    actions,
    pathStatus,
    currentPathStatusValue,
    relatedLists,
    warnings,
  };
}

export function buildFormPreviewModel(draft: FormFormDraft): FormPreviewModel {
  const warnings: string[] = [];
  validateJsonArray(draft.queryWhereJson, "Form query.where", warnings);
  validateJsonArray(draft.queryOrderByJson, "Form query.orderBy", warnings);
  const sections = draft.sections
    .map((section, sectionIndex) => {
      const fields: FormPreviewSection["fields"] = section.fields
        .filter((field) => hasFormPreviewField(field))
        .map((field, fieldIndex) => ({
          field: normalizeText(field.field),
          label: resolveFormPreviewLabel(field, fieldIndex),
          inputType: resolvePreviewInputType(field),
          required: undefined as boolean | undefined,
          placeholder: normalizeText(field.placeholder),
          lookup: hasLookupDraftValue(field)
            ? {
                searchField: normalizeText(field.lookup.searchField),
                prefill: field.lookup.prefill ? true : undefined,
              }
            : undefined,
        }));

      for (const [fieldIndex, field] of section.fields.entries()) {
        if (!hasLookupDraftValue(field)) {
          continue;
        }

        validateJsonArray(
          field.lookup.whereJson,
          `Form section ${sectionIndex + 1} field ${fieldIndex + 1} lookup.where`,
          warnings,
        );
        validateJsonArray(
          field.lookup.orderByJson,
          `Form section ${sectionIndex + 1} field ${fieldIndex + 1} lookup.orderBy`,
          warnings,
        );
      }

      if (fields.length === 0 && !normalizeText(section.title)) {
        return null;
      }

      return {
        title: normalizeText(section.title) ?? `Section ${sectionIndex + 1}`,
        fields,
      };
    })
    .filter((section): section is FormPreviewSection => section !== null);

  const hints = new Map<string, MockFieldHint>();
  const fieldPaths = new Set<string>();

  for (const section of draft.sections) {
    for (const field of section.fields) {
      const fieldPath = normalizeText(field.field);
      if (!fieldPath) {
        continue;
      }

      fieldPaths.add(fieldPath);
      mergeHint(hints, fieldPath, {
        inputType: resolvePreviewInputType(field),
        label: toLabel(fieldPath),
        lookup: hasLookupDraftValue(field),
      });
    }
  }

  return {
    createTitle: normalizeText(draft.createTitle),
    editTitle: normalizeText(draft.editTitle),
    title:
      normalizeText(draft.createTitle) ??
      normalizeText(draft.editTitle) ??
      "Form preview",
    subtitle: normalizeText(draft.subtitle),
    values: buildMockRecord(fieldPaths, hints),
    sections,
    warnings,
  };
}

function buildRelatedListPreview(
  draft: RelatedListDraft,
  index: number,
  warnings: string[],
): DetailPreviewRelatedList | null {
  if (!hasAnyRelatedListValue(draft)) {
    return null;
  }

  const id = normalizeText(draft.id);
  const label = normalizeText(draft.label) ?? id ?? `Related list ${index + 1}`;
  validateJsonArray(
    draft.queryWhereJson,
    `Related list ${label} query.where`,
    warnings,
  );
  validateJsonArray(
    draft.queryOrderByJson,
    `Related list ${label} query.orderBy`,
    warnings,
  );
  const actions = safeParseActionsJson(
    draft.actionsJson,
    `Related list ${label} actions`,
    warnings,
  );
  const rowActions = safeParseActionsJson(
    draft.rowActionsJson,
    `Related list ${label} row actions`,
    warnings,
  );

  return {
    id: id ?? `related-${index + 1}`,
    label,
    description: normalizeText(draft.description),
    entityId: normalizeText(draft.entityId),
    objectApiName: normalizeText(draft.objectApiName),
    columns: parseColumnsDraft(draft.columns),
    actions,
    rowActions,
    queryFieldCount: draft.queryFields.filter((field) => normalizeText(field))
      .length,
  };
}

function hasDetailPreviewField(field: {
  label: string;
  field: string;
  template: string;
}): boolean {
  return Boolean(
    normalizeText(field.label) ||
    normalizeText(field.field) ||
    normalizeText(field.template),
  );
}

function hasFormPreviewField(field: { field: string; placeholder: string; lookup: FormFieldDraft["lookup"] }): boolean {
  return Boolean(
    normalizeText(field.field) ||
      normalizeText(field.placeholder) ||
      hasLookupDraftValue(field),
  );
}

function hasAnyRelatedListValue(draft: RelatedListDraft): boolean {
  return Boolean(
    normalizeText(draft.id) ||
    normalizeText(draft.label) ||
    normalizeText(draft.description) ||
    normalizeText(draft.entityId) ||
    normalizeText(draft.objectApiName) ||
    normalizeText(draft.queryWhereJson) ||
    normalizeText(draft.queryOrderByJson) ||
    normalizeText(draft.queryLimit) ||
    normalizeText(draft.columns) ||
    normalizeText(draft.actionsJson) ||
    normalizeText(draft.rowActionsJson) ||
    normalizeText(draft.emptyState) ||
    normalizeText(draft.pageSize) ||
    draft.queryFields.some((field) => Boolean(normalizeText(field))),
  );
}

function resolveFormPreviewLabel(
  field: FormFieldDraft,
  fieldIndex: number,
): string {
  const fieldPath = normalizeText(field.field);
  if (fieldPath) {
    return toLabel(fieldPath);
  }

  return `Field ${fieldIndex + 1}`;
}

function resolvePreviewInputType(
  field: FormFieldDraft,
): "text" | "email" | "tel" | "date" | "datetime-local" | "time" | "url" | "password" | "textarea" | "number" | "checkbox" | "lookup" {
  if (hasLookupDraftValue(field)) {
    return "lookup";
  }

  const normalizedField = normalizeText(field.field)?.toLowerCase() ?? "";
  if (normalizedField.includes("email")) {
    return "email";
  }

  if (
    normalizedField.includes("phone") ||
    normalizedField.includes("mobile") ||
    normalizedField.includes("fax")
  ) {
    return "tel";
  }

  if (
    normalizedField.includes("datetime") ||
    normalizedField.includes("timestamp")
  ) {
    return "datetime-local";
  }

  if (
    normalizedField.includes("date") ||
    normalizedField.includes("deadline") ||
    normalizedField.includes("start") ||
    normalizedField.includes("end")
  ) {
    return "date";
  }

  if (
    normalizedField.includes("time") ||
    normalizedField.includes("hour")
  ) {
    return "time";
  }

  if (
    normalizedField.includes("url") ||
    normalizedField.includes("website") ||
    normalizedField.includes("site") ||
    normalizedField.includes("link")
  ) {
    return "url";
  }

  if (
    normalizedField.includes("password") ||
    normalizedField.includes("secret") ||
    normalizedField.includes("token") ||
    normalizedField.includes("encrypted")
  ) {
    return "password";
  }

  if (
    normalizedField.includes("description") ||
    normalizedField.includes("note") ||
    normalizedField.includes("comment")
  ) {
    return "textarea";
  }

  if (
    normalizedField.includes("amount") ||
    normalizedField.includes("total") ||
    normalizedField.includes("value") ||
    normalizedField.includes("price") ||
    normalizedField.includes("revenue") ||
    normalizedField.includes("count") ||
    normalizedField.includes("number") ||
    normalizedField.includes("qty") ||
    normalizedField.includes("quantity")
  ) {
    return "number";
  }

  if (
    normalizedField.startsWith("is") ||
    normalizedField.startsWith("has") ||
    normalizedField.startsWith("can") ||
    normalizedField.includes("enabled") ||
    normalizedField.includes("active")
  ) {
    return "checkbox";
  }

  return "text";
}

function hasLookupDraftValue(field: { lookup: FormFieldDraft["lookup"] }): boolean {
  return Boolean(
    normalizeText(field.lookup.searchField) ||
      normalizeText(field.lookup.whereJson) ||
      normalizeText(field.lookup.orderByJson) ||
      field.lookup.prefill,
  );
}

function mergeHint(
  hints: Map<string, MockFieldHint>,
  fieldPath: string,
  patch: MockFieldHint,
) {
  const current = hints.get(fieldPath) ?? {};
  hints.set(fieldPath, {
    format: patch.format ?? current.format,
    inputType: patch.inputType ?? current.inputType,
    label: patch.label ?? current.label,
    lookup: patch.lookup ?? current.lookup,
  });
}

function buildMockRecord(
  fieldPaths: Iterable<string>,
  hints: Map<string, MockFieldHint>,
): EntityRecord {
  const record: EntityRecord = {};

  for (const fieldPath of fieldPaths) {
    const normalized = normalizeText(fieldPath);
    if (!normalized) {
      continue;
    }

    setRecordValue(
      record,
      normalized,
      createMockValue(normalized, hints.get(normalized)),
    );
  }

  return record;
}

function setRecordValue(
  record: EntityRecord,
  fieldPath: string,
  value: unknown,
) {
  const segments = fieldPath.split(".").filter(Boolean);
  if (segments.length === 0) {
    return;
  }

  let current: EntityRecord = record;

  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[segment] = {};
    }

    current = current[segment] as EntityRecord;
  }

  current[segments[segments.length - 1]] = value;
}

function createMockValue(
  fieldPath: string,
  hint: MockFieldHint | undefined,
): unknown {
  const segments = fieldPath.split(".").filter(Boolean);
  const leaf = segments[segments.length - 1] ?? fieldPath;
  const normalizedLeaf = leaf.toLowerCase();
  const normalizedLabel = hint?.label?.toLowerCase() ?? "";

  if (
    hint?.format === "date" ||
    hint?.inputType === "date" ||
    normalizedLeaf.includes("date")
  ) {
    return "2026-03-07";
  }

  if (hint?.format === "datetime" || normalizedLeaf.includes("datetime")) {
    return "2026-03-07T10:30:00Z";
  }

  if (hint?.inputType === "time" || normalizedLeaf.includes("time")) {
    return "14:30";
  }

  if (
    hint?.inputType === "url" ||
    normalizedLeaf.includes("url") ||
    normalizedLeaf.includes("website") ||
    normalizedLeaf.includes("site") ||
    normalizedLeaf.includes("link")
  ) {
    return "https://example.com";
  }

  if (
    hint?.inputType === "password" ||
    normalizedLeaf.includes("password") ||
    normalizedLeaf.includes("secret") ||
    normalizedLeaf.includes("token") ||
    normalizedLeaf.includes("encrypted")
  ) {
    return "secret-value";
  }

  if (hint?.inputType === "email" || normalizedLeaf.includes("email")) {
    return "mario.rossi@example.com";
  }

  if (
    hint?.inputType === "tel" ||
    normalizedLeaf.includes("phone") ||
    normalizedLeaf.includes("mobile") ||
    normalizedLeaf.includes("fax")
  ) {
    return "+39 02 5555 1234";
  }

  if (
    normalizedLeaf.includes("amount") ||
    normalizedLeaf.includes("total") ||
    normalizedLeaf.includes("value") ||
    normalizedLeaf.includes("price") ||
    normalizedLeaf.includes("revenue")
  ) {
    return 12500;
  }

  if (
    normalizedLeaf.includes("percent") ||
    normalizedLeaf.includes("rate") ||
    normalizedLabel.includes("percent")
  ) {
    return 24;
  }

  if (normalizedLeaf.includes("status")) {
    return "In corso";
  }

  if (normalizedLeaf.includes("stage")) {
    return "Qualificazione";
  }

  if (normalizedLeaf.includes("type") || normalizedLeaf.includes("category")) {
    return "Standard";
  }

  if (
    normalizedLeaf.startsWith("is") ||
    normalizedLeaf.startsWith("has") ||
    normalizedLeaf.startsWith("can") ||
    normalizedLeaf.includes("enabled") ||
    normalizedLeaf.includes("active")
  ) {
    return true;
  }

  if (
    normalizedLeaf.includes("description") ||
    normalizedLeaf.includes("note") ||
    normalizedLeaf.includes("comment")
  ) {
    return "Descrizione di esempio";
  }

  if (normalizedLeaf.includes("city")) {
    return "Milano";
  }

  if (normalizedLeaf.includes("country")) {
    return "Italia";
  }

  if (
    normalizedLeaf.includes("count") ||
    normalizedLeaf.includes("number") ||
    normalizedLeaf.includes("qty") ||
    normalizedLeaf.includes("quantity")
  ) {
    return 3;
  }

  if (normalizedLeaf === "name") {
    const parent = segments.at(-2)?.toLowerCase();
    if (
      parent === "owner" ||
      parent === "createdby" ||
      parent === "lastmodifiedby"
    ) {
      return "Mario Rossi";
    }

    if (parent === "account" || normalizedLabel.includes("account")) {
      return "Acme S.p.A.";
    }

    if (parent === "contact" || normalizedLabel.includes("contact")) {
      return "Mario Rossi";
    }

    return "Record Preview";
  }

  if (hint?.lookup) {
    return "Record collegato";
  }

  if (normalizedLeaf.endsWith("id")) {
    return "a01-preview-id";
  }

  return `Sample ${hint?.label ?? toLabel(leaf)}`;
}

function buildPathStatusPreview(
  draft: DetailFormDraft,
  warnings: string[],
): PathStatusConfig | undefined {
  if (!draft.pathStatusEnabled) {
    return undefined;
  }

  const field = normalizeText(draft.pathStatusField);
  if (!field) {
    warnings.push("Path status: field non configurato, preview parziale.");
    return undefined;
  }

  const steps: PathStatusConfig["steps"] = [];

  for (const step of draft.pathStatusSteps) {
    const value = normalizeText(step.value);
    if (!value) {
      continue;
    }

    steps.push({
      value,
      label: normalizeText(step.label),
    });
  }

  if (steps.length === 0) {
    warnings.push(
      "Path status: nessuno step valido configurato, preview parziale.",
    );
    return undefined;
  }

  return {
    field,
    steps,
    allowUpdate: draft.pathStatusAllowUpdate,
  };
}

function safeParseActionsJson(
  value: string,
  label: string,
  warnings: string[],
): EntityAction[] {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    warnings.push(`${label}: JSON non valido, preview parziale.`);
    return [];
  }

  if (!Array.isArray(parsed)) {
    warnings.push(`${label}: formato non valido, preview parziale.`);
    return [];
  }

  return parsed
    .map((entry) => mapActionEntry(entry))
    .filter((entry): entry is EntityAction => entry !== null);
}

function mapActionEntry(entry: unknown): EntityAction | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const type = record.type;
  if (type !== "edit" && type !== "delete" && type !== "link") {
    return null;
  }

  const label = normalizeText(record.label);
  const target = normalizeText(record.target);
  const entityId = normalizeText(record.entityId);

  return {
    type,
    label,
    target,
    entityId,
  };
}

function parseColumnsDraft(value: string): EntityColumn[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const separatorIndex = line.indexOf("|");
      if (separatorIndex < 0) {
        return {
          field: line,
          label: toLabel(line),
        };
      }

      const field = line.slice(0, separatorIndex).trim();
      const label = line.slice(separatorIndex + 1).trim();
      return {
        field,
        label: label || toLabel(field),
      };
    })
    .filter((column) => column.field.length > 0);
}

function validateJsonArray(value: string, label: string, warnings: string[]) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      warnings.push(`${label}: atteso array JSON, preview parziale.`);
    }
  } catch {
    warnings.push(`${label}: JSON non valido, preview parziale.`);
  }
}

function extractTemplateFieldPaths(template: string): string[] {
  const normalized = normalizeText(template);
  if (!normalized) {
    return [];
  }

  const matches = normalized.matchAll(/\{\{\s*([^}]+)\s*\}\}/g);
  const paths: string[] = [];

  for (const match of matches) {
    const expression = match[1];
    if (!expression) {
      continue;
    }

    for (const candidate of expression.split("||")) {
      const fieldPath = normalizeText(candidate);
      if (fieldPath) {
        paths.push(fieldPath);
      }
    }
  }

  return paths;
}

function renderTemplateValue(
  template: string,
  record: EntityRecord,
): string | undefined {
  const normalized = normalizeText(template);
  if (!normalized) {
    return undefined;
  }

  const rendered = renderRecordTemplate(normalized, record).trim();
  return rendered.length > 0 ? rendered : undefined;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function describeDetailSectionPreviewFields(
  fields: Array<{ label: string; field: string; template: string }>,
): string[] {
  return fields
    .map(
      (field) =>
        normalizeText(field.label) ??
        normalizeText(field.field) ??
        normalizeText(field.template),
    )
    .filter((value): value is string => Boolean(value));
}

export function describeFormSectionPreviewFields(
  fields: Array<{ field: string }>,
): string[] {
  return fields
    .map((field) => normalizeText(field.field))
    .filter((value): value is string => Boolean(value));
}

export function hasPreviewRelatedLookupValue(
  record: EntityRecord,
  fieldPath: string,
): boolean {
  return resolveFieldValue(record, fieldPath) !== undefined;
}
