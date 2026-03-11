export type CompanyCategory = 'EBT' | 'Startup';

export type ActionType = 'call' | 'meeting' | 'email' | 'mentoring' | 'diagnostic' | 'routing' | 'other';

export type MilestoneType = 'capital' | 'new-markets' | 'alliances' | 'awards' | 'other';

export type TaskStatus = 'pending' | 'completed';

export type PropertyType = 'general' | 'metric-by-year';

export type ContactGender = 'male' | 'female' | 'other' | '';

export type CustomFieldType = 'text' | 'number' | 'select' | 'metric_by_year';

export const GENDER_LABELS: Record<string, string> = {
  male: 'Masculino',
  female: 'Femenino',
  other: 'Otro',
};

export const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  select: 'Selección',
  metric_by_year: 'Métrica por año',
};

export interface Contact {
  id: string;
  name: string;
  position: string;
  email: string;
  phone: string;
  notes: string;
  isPrimary: boolean;
  gender: ContactGender;
}

export interface CompanyAction {
  id: string;
  type: ActionType;
  description: string;
  date: string;
  notes?: string;
  createdBy?: string;
}

export interface Milestone {
  id: string;
  type: MilestoneType;
  title: string;
  description: string;
  date: string;
  createdBy?: string;
}

export interface CompanyTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string;
  completedDate?: string;
  createdBy?: string;
  assignedTo?: string;
}

export interface MetricByYear {
  [year: number]: number;
}

export interface CustomProperty {
  id: string;
  name: string;
  type: PropertyType;
  value?: string | number;
  yearValues?: MetricByYear;
}

export interface CustomSection {
  id: string;
  name: string;
  displayOrder: number;
}

export interface CustomField {
  id: string;
  sectionId: string | null;
  name: string;
  fieldType: CustomFieldType;
  options: string[]; // for select type
  displayOrder: number;
}

export interface CustomFieldValue {
  id: string;
  companyId: string;
  fieldId: string;
  textValue: string;
  numberValue: number | null;
  yearValues: MetricByYear;
}

export interface Company {
  id: string;
  tradeName: string;
  legalName: string;
  nit: string;
  category: CompanyCategory;
  vertical: string;
  economicActivity: string;
  description: string;
  city: string;
  salesByYear: MetricByYear;
  exportsUSD: number;
  website: string;
  logo?: string;
  contacts: Contact[];
  actions: CompanyAction[];
  milestones: Milestone[];
  tasks: CompanyTask[];
  customProperties: CustomProperty[];
  fieldValues: CustomFieldValue[];
  createdAt: string;
}

export type SortField = 'tradeName' | 'city' | 'vertical' | 'salesByYear' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

export interface FilterState {
  search: string;
  category: string;
  vertical: string;
  city: string;
  economicActivity: string;
  salesMin: string;
  salesMax: string;
  avgYoYMin: string;
  avgYoYMax: string;
  lastYoYMin: string;
  lastYoYMax: string;
  activeYear: number;
  nitFilter: '' | 'has' | 'no';
  customFieldFilters: Record<string, string>; // fieldId -> value
  sortField: SortField;
  sortDirection: SortDirection;
}

export interface SavedView {
  id: string;
  name: string;
  filters: FilterState;
}

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  call: 'Llamada',
  meeting: 'Reunión',
  email: 'Email',
  mentoring: 'Mentoría',
  diagnostic: 'Diagnóstico',
  routing: 'Enrutamiento',
  other: 'Otro',
};

export const MILESTONE_TYPE_LABELS: Record<MilestoneType, string> = {
  capital: 'Levantó capital',
  'new-markets': 'Nuevos mercados',
  alliances: 'Alianzas',
  awards: 'Premios',
  other: 'Otro',
};

export const VERTICALS = [
  'Biotecnología', 'AgriTech', 'IA / Machine Learning', 'HealthTech',
  'CleanTech', 'FinTech', 'EdTech', 'LogTech', 'FoodTech', 'Otro'
];

export const CITIES = [
  'Cali', 'Palmira', 'Yumbo', 'Jamundí', 'Buenaventura', 'Buga', 'Tuluá', 'Cartago', 'Otra'
];

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  category: '',
  vertical: '',
  city: '',
  economicActivity: '',
  salesMin: '',
  salesMax: '',
  avgYoYMin: '',
  avgYoYMax: '',
  lastYoYMin: '',
  lastYoYMax: '',
  activeYear: new Date().getFullYear() - 1,
  nitFilter: '',
  customFieldFilters: {},
  sortField: 'tradeName',
  sortDirection: 'asc',
};
