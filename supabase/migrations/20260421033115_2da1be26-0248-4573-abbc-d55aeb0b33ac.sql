
-- ============================================================
-- Fix 1: custom_sections — scope to authenticated only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read custom_sections" ON public.custom_sections;
DROP POLICY IF EXISTS "Authenticated users can insert custom_sections" ON public.custom_sections;
DROP POLICY IF EXISTS "Authenticated users can update custom_sections" ON public.custom_sections;
DROP POLICY IF EXISTS "Authenticated users can delete custom_sections" ON public.custom_sections;

CREATE POLICY "Authenticated users can read custom_sections"
  ON public.custom_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert custom_sections"
  ON public.custom_sections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom_sections"
  ON public.custom_sections FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete custom_sections"
  ON public.custom_sections FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Fix 2: custom_fields — scope to authenticated only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "Authenticated users can insert custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "Authenticated users can update custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "Authenticated users can delete custom_fields" ON public.custom_fields;

CREATE POLICY "Authenticated users can read custom_fields"
  ON public.custom_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert custom_fields"
  ON public.custom_fields FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom_fields"
  ON public.custom_fields FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete custom_fields"
  ON public.custom_fields FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Fix 3: custom_field_values — scope to authenticated only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read custom_field_values" ON public.custom_field_values;
DROP POLICY IF EXISTS "Authenticated users can insert custom_field_values" ON public.custom_field_values;
DROP POLICY IF EXISTS "Authenticated users can update custom_field_values" ON public.custom_field_values;
DROP POLICY IF EXISTS "Authenticated users can delete custom_field_values" ON public.custom_field_values;

CREATE POLICY "Authenticated users can read custom_field_values"
  ON public.custom_field_values FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert custom_field_values"
  ON public.custom_field_values FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom_field_values"
  ON public.custom_field_values FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete custom_field_values"
  ON public.custom_field_values FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Fix 4: external_form_sessions — restrict reads to service_role
-- (sessions contain IP addresses and session tokens of external submitters)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can read sessions" ON public.external_form_sessions;
-- service_role policy already exists ("Service role manages sessions") and covers backend access.
