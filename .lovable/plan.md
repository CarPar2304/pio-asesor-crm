

## Analysis

After reviewing the code thoroughly, the "Ventas por año" button **does exist** in the form constructor code. The `CRM_FIELD_MAPPINGS` array in `externalForms.ts` includes it, and `FormWizardDialog.tsx` renders all mappings as buttons in the "Agregar campos del CRM" section on step 3 (Campos).

The likely issue is **visibility**: the "Agregar campos del CRM" section appears at the **bottom** of the step, below the field list (which has its own `max-h-[350px]` scroll area) and below any inline dialogs (new section, new field). If you have several fields already added, you need to scroll down within the dialog to see the CRM buttons section where "Ventas por año" appears.

## Plan

To make this more accessible, I will:

1. **Move the "Agregar campos del CRM" section above the field list** in the wizard step 3, so it's immediately visible when you enter the fields step -- the buttons to add fields appear first, then the list of added fields below.

2. **Verify the button renders correctly** by checking there are no conditional filters excluding `sales_by_year` from the button list.

### Files to modify
- `src/components/forms/FormWizardDialog.tsx` -- Reorder the step 3 layout so the CRM quick-add buttons appear at the top (before the field list), making "Ventas por año", "Logo", and all other CRM fields immediately visible without scrolling.

