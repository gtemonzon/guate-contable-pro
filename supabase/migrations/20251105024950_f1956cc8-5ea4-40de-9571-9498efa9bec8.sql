-- Permitir a super admins gestionar tipos de documentos FEL
CREATE POLICY "Super admins can insert FEL document types"
  ON tab_fel_document_types
  FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update FEL document types"
  ON tab_fel_document_types
  FOR UPDATE
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete FEL document types"
  ON tab_fel_document_types
  FOR DELETE
  TO authenticated
  USING (is_super_admin(auth.uid()));