-- Section widgets: configurable visualizations per dynamic section
CREATE TABLE public.section_widgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES public.custom_sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  widget_type TEXT NOT NULL DEFAULT 'kpi', -- kpi | bar | line | pie | table
  source_type TEXT NOT NULL DEFAULT 'custom_field', -- custom_field | native
  source_key TEXT NOT NULL DEFAULT '', -- custom_field id (uuid) OR native key (e.g. 'salesByYear', 'exportsUSD', 'vertical', 'city', 'category')
  calculation TEXT NOT NULL DEFAULT 'last', -- last | sum | avg | max | min | yoy (for KPI)
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- {color, size: 'sm'|'md'|'lg'|'full', extra options}
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_section_widgets_section ON public.section_widgets(section_id, display_order);

ALTER TABLE public.section_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read section_widgets"
  ON public.section_widgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert section_widgets"
  ON public.section_widgets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update section_widgets"
  ON public.section_widgets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete section_widgets"
  ON public.section_widgets FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_section_widgets_updated_at
  BEFORE UPDATE ON public.section_widgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();