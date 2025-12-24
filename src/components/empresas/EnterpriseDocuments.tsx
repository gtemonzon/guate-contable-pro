import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFileDrop } from "@/hooks/use-file-drop";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Plus,
  Download,
  Trash2,
  Upload,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DOCUMENT_TYPES, MAX_FILE_SIZE, MAX_DOCUMENTS_PER_ENTERPRISE, DocumentType } from "@/constants/documentTypes";
import {
  validateFileType,
  validateFileSize,
  generateUniqueFileName,
  formatFileSize,
  getDocumentTypeLabel,
} from "@/utils/documentValidation";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import type { Database } from "@/integrations/supabase/types";

type EnterpriseDocument = Database['public']['Tables']['tab_enterprise_documents']['Row'];

interface EnterpriseDocumentsProps {
  enterpriseId: number;
}

export const EnterpriseDocuments = ({ enterpriseId }: EnterpriseDocumentsProps) => {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<EnterpriseDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<EnterpriseDocument | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Form state
  const [documentType, setDocumentType] = useState<DocumentType>("otro");
  const [documentName, setDocumentName] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('tab_enterprise_documents')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .eq('is_active', true)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al cargar documentos",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [enterpriseId]);

  const resetForm = () => {
    setDocumentType("otro");
    setDocumentName("");
    setNotes("");
    setSelectedFile(null);
    setUploadProgress(0);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {
    if (!validateFileType(file)) {
      toast({
        variant: "destructive",
        title: "Tipo de archivo inválido",
        description: "Solo se permiten archivos PDF",
      });
      return;
    }

    if (!validateFileSize(file)) {
      toast({
        variant: "destructive",
        title: "Archivo muy grande",
        description: `El archivo excede el tamaño máximo de ${formatFileSize(MAX_FILE_SIZE)}`,
      });
      return;
    }

    setSelectedFile(file);
  };

  const { isDragging, dragProps } = useFileDrop({
    accept: [".pdf", "application/pdf"],
    maxSize: MAX_FILE_SIZE,
    onFile: processFile,
    onError: (message) => toast({ variant: "destructive", title: "Error", description: message }),
    disabled: isUploading,
  });

  const handleUpload = async () => {
    if (!selectedFile || !documentName.trim()) {
      toast({
        variant: "destructive",
        title: "Datos incompletos",
        description: "Por favor complete todos los campos requeridos",
      });
      return;
    }

    if (documents.length >= MAX_DOCUMENTS_PER_ENTERPRISE) {
      toast({
        variant: "destructive",
        title: "Límite alcanzado",
        description: `No puede subir más de ${MAX_DOCUMENTS_PER_ENTERPRISE} documentos por empresa`,
      });
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(10);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const filePath = generateUniqueFileName(enterpriseId, selectedFile.name);
      setUploadProgress(30);

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('enterprise-documents')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;
      setUploadProgress(60);

      // Create database record
      const { error: dbError } = await supabase
        .from('tab_enterprise_documents')
        .insert({
          enterprise_id: enterpriseId,
          document_type: documentType,
          document_name: documentName.trim(),
          file_name: selectedFile.name,
          file_path: filePath,
          file_size: selectedFile.size,
          uploaded_by: user.id,
          notes: notes.trim() || null,
        });

      if (dbError) throw dbError;
      setUploadProgress(100);

      toast({
        title: "Documento subido exitosamente",
        description: `${documentName} ha sido agregado`,
      });

      setUploadDialogOpen(false);
      resetForm();
      fetchDocuments();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al subir documento",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDownload = async (document: EnterpriseDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('enterprise-documents')
        .createSignedUrl(document.file_path, 3600); // 1 hour

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("No se pudo generar URL de descarga");

      window.open(data.signedUrl, '_blank');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al descargar documento",
        description: getSafeErrorMessage(error),
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedDocument) return;

    try {
      // Soft delete - mark as inactive
      const { error } = await supabase
        .from('tab_enterprise_documents')
        .update({ is_active: false })
        .eq('id', selectedDocument.id);

      if (error) throw error;

      toast({
        title: "Documento eliminado",
        description: "El documento ha sido eliminado exitosamente",
      });

      setDeleteDialogOpen(false);
      setSelectedDocument(null);
      fetchDocuments();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al eliminar documento",
        description: getSafeErrorMessage(error),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {documents.length} de {MAX_DOCUMENTS_PER_ENTERPRISE} documentos
          </p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Agregar Documento
        </Button>
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No hay documentos adjuntos</p>
            <p className="text-sm text-muted-foreground mb-4">
              Comienza agregando documentos importantes de la empresa
            </p>
            <Button onClick={() => setUploadDialogOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Agregar Primer Documento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 bg-muted rounded">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium truncate">{doc.document_name}</h4>
                        <Badge variant="secondary" className="text-xs">
                          {getDocumentTypeLabel(doc.document_type)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {doc.file_name}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span>•</span>
                        <span>
                          {new Date(doc.uploaded_at).toLocaleDateString('es-GT')}
                        </span>
                      </div>
                      {doc.notes && (
                        <p className="text-sm text-muted-foreground mt-2 italic">
                          {doc.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(doc)}
                      title="Ver/Descargar"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedDocument(doc);
                        setDeleteDialogOpen(true);
                      }}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Agregar Documento</DialogTitle>
            <DialogDescription>
              Suba un documento PDF relacionado con la empresa (máximo {formatFileSize(MAX_FILE_SIZE)})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="document-type">Tipo de Documento *</Label>
              <Select value={documentType} onValueChange={(value) => setDocumentType(value as DocumentType)}>
                <SelectTrigger id="document-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_TYPES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="document-name">Nombre Descriptivo *</Label>
              <Input
                id="document-name"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="Ej: RTU vigente 2024"
                maxLength={200}
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas (Opcional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Información adicional sobre el documento"
                maxLength={500}
                rows={3}
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <Label>Archivo PDF *</Label>
              <div
                {...dragProps}
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                  isDragging && "border-primary bg-primary/5",
                  !isDragging && "border-border"
                )}
              >
                {selectedFile ? (
                  <div className="space-y-2">
                    <FileText className="h-10 w-10 mx-auto text-primary" />
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedFile(null)}
                      disabled={isUploading}
                    >
                      Cambiar archivo
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className={cn("h-10 w-10 mx-auto", isDragging ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <Label
                        htmlFor="file-upload"
                        className="cursor-pointer text-primary hover:underline"
                      >
                        {isDragging ? "Suelta el archivo aquí" : "Arrastra un archivo o haz clic para seleccionar"}
                      </Label>
                      <Input
                        id="file-upload"
                        type="file"
                        accept=".pdf"
                        onChange={handleFileSelect}
                        className="hidden"
                        disabled={isUploading}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Máximo {formatFileSize(MAX_FILE_SIZE)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Subiendo documento...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false);
                resetForm();
              }}
              disabled={isUploading}
            >
              Cancelar
            </Button>
            <Button onClick={handleUpload} disabled={isUploading || !selectedFile || !documentName.trim()}>
              {isUploading ? "Subiendo..." : "Guardar Documento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente el documento "{selectedDocument?.document_name}".
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedDocument(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
