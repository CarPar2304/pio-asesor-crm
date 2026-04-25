import { CRM_FIELD_MAPPINGS } from '@/types/externalForms';

export interface CRMCatalogEntry {
  field_key: string;
  label: string;
  field_type: string;
  section?: string;
  crm_table: string | null;
  crm_column: string | null;
  crm_field_id: string | null;
  options?: string[];
}

export function buildCrmCatalog(
  customSections: { id: string; name: string }[],
  customFields: { id: string; name: string; fieldType: string; sectionId: string | null; options?: string[] }[]
): CRMCatalogEntry[] {
  const list: CRMCatalogEntry[] = [];

  for (const m of CRM_FIELD_MAPPINGS) {
    let type = 'short_text';
    if (m.column === 'logo') type = 'file';
    else if (m.column === 'sales_by_year') type = 'sales_by_year';
    else if (m.column === 'exports_usd') type = 'number';
    else if (m.column === 'description') type = 'long_text';
    else if (m.column === 'website') type = 'url';
    else if (m.column === 'email') type = 'email';
    else if (m.column === 'phone') type = 'phone';
    else if (['category', 'vertical', 'economic_activity', 'city'].includes(m.column)) type = 'select';

    list.push({
      field_key: `${m.table}_${m.column}`,
      label: m.label,
      field_type: type,
      crm_table: m.table,
      crm_column: m.column,
      crm_field_id: null,
    });
  }

  for (const cf of customFields) {
    const section = customSections.find(s => s.id === cf.sectionId);
    list.push({
      field_key: `custom_${cf.id}`,
      label: cf.name,
      field_type: cf.fieldType === 'number' ? 'number' : cf.fieldType === 'select' ? 'select' : 'short_text',
      section: section?.name,
      crm_table: 'custom_field_values',
      crm_column: null,
      crm_field_id: cf.id,
      options: cf.options || [],
    });
  }

  return list;
}
