export type CompanyCategory = 'EBT' | 'Startup';

export type ActionType = 'call' | 'meeting' | 'email' | 'mentoring' | 'diagnostic' | 'routing' | 'other';

export type MilestoneType = 'capital' | 'new-markets' | 'alliances' | 'awards' | 'other';

export type TaskStatus = 'pending' | 'completed';

export type PropertyType = 'general' | 'metric-by-year';

export type ContactGender = 'male' | 'female' | 'other' | '';

export const GENDER_LABELS: Record<string, string> = {
  male: 'Masculino',
  female: 'Femenino',
  other: 'Otro',
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
}

export interface Milestone {
  id: string;
  type: MilestoneType;
  title: string;
  description: string;
  date: string;
}

export interface CompanyTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string;
  completedDate?: string;
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
  logo?: string;
  contacts: Contact[];
  actions: CompanyAction[];
  milestones: Milestone[];
  tasks: CompanyTask[];
  customProperties: CustomProperty[];
  createdAt: string;
}

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
};
