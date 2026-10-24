ALTER TABLE tests ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE runs ADD COLUMN test_snapshot JSONB;

UPDATE runs r SET test_snapshot = jsonb_build_object(
  'name', t.name,
  'url', t.url,
  'steps', t.steps,
  'metadata', t.metadata
)
FROM tests t
WHERE r.test_id = t.id AND r.test_snapshot IS NULL;

UPDATE runs SET step_results = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN result ? 'text' THEN result
      ELSE result || jsonb_build_object('text', COALESCE((
        SELECT step->>'text' FROM jsonb_array_elements(test_snapshot->'steps') step
        WHERE step->>'id' = result->>'stepId' LIMIT 1
      ), ''))
    END ORDER BY ordinal
  ), '[]'::jsonb)
  FROM jsonb_array_elements(step_results) WITH ORDINALITY AS items(result, ordinal)
)
WHERE step_results IS NOT NULL;

ALTER TABLE runs ALTER COLUMN test_snapshot SET NOT NULL;
