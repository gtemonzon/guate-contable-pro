import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from "@/constants/documentTypes";

export const validateFileType = (file: File): boolean => {
  return ALLOWED_FILE_TYPES.includes(file.type);
};

export const validateFileSize = (file: File): boolean => {
  return file.size <= MAX_FILE_SIZE;
};

export const generateUniqueFileName = (
  enterpriseId: number,
  originalName: string
): string => {
  const timestamp = Date.now();
  const sanitizedName = originalName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .toLowerCase();
  return `${enterpriseId}/${timestamp}-${sanitizedName}`;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const getDocumentTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    representacion_legal: 'Representación Legal',
    dpi_propietario: 'DPI del Propietario',
    rtu: 'RTU',
    solvencia_fiscal: 'Solvencia Fiscal',
    patente_comercio: 'Patente de Comercio',
    acta_constitucion: 'Acta de Constitución',
    nombramiento_representante: 'Nombramiento de Representante Legal',
    certificacion_municipal: 'Certificación Municipal',
    otro: 'Otro Documento'
  };
  return labels[type] || type;
};
