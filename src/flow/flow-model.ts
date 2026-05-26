export interface FormField {
  name: string;
  type: string;
  required: boolean;
  placeholder?: string;
  hint?: string;
}

export interface PageForm {
  action: string;
  method: string;
  fields: FormField[];
  submitText?: string;
}

export interface Transition {
  trigger: string;
  selector?: string;
  from: string;
  to: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  requiresAuth: boolean;
}

export interface AppPage {
  path: string;
  title: string;
  type: string;
  auth: string;
  forms: PageForm[];
  transitions: Transition[];
  actions: string[];
  detectedEndpoints: string[];
  screenshot?: string;
}

export interface AppApi {
  method: string;
  path: string;
  params: string[];
  headers: string[];
  auth: boolean;
  sampleResponse?: string;
}

export interface AuthModel {
  type: string;
  loginPage?: string;
  registerPage?: string;
  logoutPage?: string;
  roles: string[];
  tokenLocation?: 'header' | 'cookie' | 'body';
}

export interface BusinessFlow {
  name: string;
  description: string;
  steps: string[];
  requiresAuth: string;
  criticalOperations: string[];
}

export interface AppFlowModel {
  appName: string;
  baseUrl: string;
  version: string;
  generatedAt: string;
  pages: AppPage[];
  apis: AppApi[];
  auth: AuthModel;
  flows: BusinessFlow[];
  summary: {
    totalPages: number;
    totalApis: number;
    totalFlows: number;
    authPages: number;
    formsFound: number;
    endpointsDetected: number;
  };
}
