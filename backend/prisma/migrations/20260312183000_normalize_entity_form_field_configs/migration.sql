UPDATE "entity_form_section_configs"
SET "fieldsJson" = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'field',
          NULLIF(BTRIM(COALESCE(field_item ->> 'field', '')), ''),
          'placeholder',
          NULLIF(BTRIM(COALESCE(field_item ->> 'placeholder', '')), ''),
          'lookup',
          CASE
            WHEN jsonb_typeof(field_item -> 'lookup') = 'object' THEN NULLIF(
              jsonb_strip_nulls(
                jsonb_build_object(
                  'searchField',
                  NULLIF(BTRIM(COALESCE(field_item -> 'lookup' ->> 'searchField', '')), ''),
                  'prefill',
                  CASE
                    WHEN COALESCE((field_item -> 'lookup' ->> 'prefill')::boolean, FALSE) THEN to_jsonb(TRUE)
                    ELSE NULL
                  END,
                  'where',
                  CASE
                    WHEN jsonb_typeof(field_item -> 'lookup' -> 'where') = 'array'
                      AND jsonb_array_length(field_item -> 'lookup' -> 'where') > 0
                      THEN field_item -> 'lookup' -> 'where'
                    ELSE NULL
                  END,
                  'orderBy',
                  CASE
                    WHEN jsonb_typeof(field_item -> 'lookup' -> 'orderBy') = 'array'
                      AND jsonb_array_length(field_item -> 'lookup' -> 'orderBy') > 0
                      THEN field_item -> 'lookup' -> 'orderBy'
                    ELSE NULL
                  END
                )
              ),
              '{}'::jsonb
            )
            ELSE NULL
          END
        )
      )
    )
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof("fieldsJson"::jsonb) = 'array' THEN "fieldsJson"::jsonb
        ELSE '[]'::jsonb
      END
    ) AS field_item
    WHERE NULLIF(BTRIM(COALESCE(field_item ->> 'field', '')), '') IS NOT NULL
  ),
  '[]'::jsonb
);
