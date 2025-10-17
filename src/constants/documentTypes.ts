export const DOCUMENT_TYPES = {
  representacion_legal: 'Representación Legal',
  dpi_propietario: 'DPI del Propietario',
  rtu: 'RTU (Registro Tributario Unificado)',
  solvencia_fiscal: 'Solvencia Fiscal',
  patente_comercio: 'Patente de Comercio',
  acta_constitucion: 'Acta de Constitución',
  nombramiento_representante: 'Nombramiento de Representante Legal',
  certificacion_municipal: 'Certificación Municipal',
  otro: 'Otro Documento'
} as const;

export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_DOCUMENTS_PER_ENTERPRISE = 15;
export const ALLOWED_FILE_TYPES = ['application/pdf'];

// Important documents that should be highlighted
export const IMPORTANT_DOCUMENT_TYPES: DocumentType[] = [
  'rtu',
  'solvencia_fiscal',
  'patente_comercio',
  'acta_constitucion'
];
