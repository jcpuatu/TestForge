export type Role = 'ADMIN' | 'LEAD' | 'TESTER' | 'VIEWER';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CaseTemplate = 'TEXT' | 'STEPS' | 'EXPLORATORY' | 'BDD';
export type CaseType =
  | 'FUNCTIONAL'
  | 'SMOKE'
  | 'REGRESSION'
  | 'PERFORMANCE'
  | 'SECURITY'
  | 'USABILITY'
  | 'ACCEPTANCE'
  | 'OTHER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { suites: number; runs: number };
}

export interface Suite {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count?: { cases: number };
}

export interface Section {
  id: string;
  suiteId: string;
  parentId: string | null;
  name: string;
  description: string | null;
  orderIndex: number;
}

export interface CaseStep {
  step: string;
  expected?: string;
}

export type BddKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

export interface BddLine {
  keyword: BddKeyword;
  text: string;
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
}

export interface SharedStepSet {
  id: string;
  projectId: string;
  name: string;
  steps: CaseStep[];
  caseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedSharedSteps {
  id: string;
  name: string;
  steps: CaseStep[];
}

export interface TestCase {
  id: string;
  suiteId: string;
  sectionId: string | null;
  title: string;
  template: CaseTemplate;
  preconditions: string | null;
  steps: CaseStep[] | null;
  expectedResult: string | null;
  mission: string | null;
  goals: string | null;
  bddLines: BddLine[] | null;
  priority: Priority;
  type: CaseType;
  estimate: string | null;
  referenceLink: string | null;
  isDeleted: boolean;
  labels: Label[];
  sharedSteps: ResolvedSharedSteps[];
  createdAt: string;
  updatedAt: string;
}
