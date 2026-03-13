const KEBAB_CASE_IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LEGACY_ALNUM_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

export function normalizeLegacyEntityMetadataId(value: string): string {
  const trimmed = value.trim();

  if (KEBAB_CASE_IDENTIFIER_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (LEGACY_ALNUM_IDENTIFIER_PATTERN.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return trimmed;
}

export function normalizeLegacyEntityResourceId(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith('entity:')) {
    return trimmed;
  }

  return `entity:${normalizeLegacyEntityMetadataId(trimmed.slice('entity:'.length))}`;
}
