UPDATE "products"
SET "sku" = derived."sku"
FROM (
  SELECT
    "id",
    CASE
      WHEN regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]', '', 'g') IN (
        'controlboxandpowersupply1permotor',
        'controlboxandpowersupply'
      ) THEN 'controlboxandpowersupply'
      WHEN regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]', '', 'g') = 'motor1perbay' THEN 'motor1perbay'
      WHEN regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]', '', 'g') IN (
        'timotionmotorcoverblack',
        'timotionmotorcoverinblack'
      ) THEN 'timotionmotorcoverblk'
      WHEN regexp_replace(lower(split_part(btrim(coalesce("name", '')), ' ', 1)), '[^a-z0-9]', '', 'g') ~ '[0-9]'
        OR split_part(btrim(coalesce("name", '')), ' ', 1) ~ '[_".-]'
        OR split_part(btrim(coalesce("name", '')), ' ', 1) = btrim(coalesce("name", ''))
      THEN regexp_replace(lower(split_part(btrim(coalesce("name", '')), ' ', 1)), '[^a-z0-9]', '', 'g')
      ELSE regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]', '', 'g')
    END AS "sku"
  FROM "products"
  WHERE lower(coalesce("manufacturer", '')) = 'sundance'
) AS derived
WHERE "products"."id" = derived."id"
  AND ("products"."sku" IS NULL OR btrim("products"."sku") = '')
  AND derived."sku" <> '';
