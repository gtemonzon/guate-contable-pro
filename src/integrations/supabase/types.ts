export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      tab_accounting_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
          end_date: string
          enterprise_id: number | null
          id: number
          notes: string | null
          start_date: string
          status: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          end_date: string
          enterprise_id?: number | null
          id?: number
          notes?: string | null
          start_date: string
          status?: string
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          end_date?: string
          enterprise_id?: number | null
          id?: number
          notes?: string | null
          start_date?: string
          status?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_accounting_periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "tab_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_accounting_periods_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_type: string
          allows_movement: boolean | null
          created_at: string | null
          enterprise_id: number | null
          id: number
          is_active: boolean | null
          is_detail_account: boolean | null
          level: number
          parent_account_id: number | null
          requires_cost_center: boolean | null
        }
        Insert: {
          account_code: string
          account_name: string
          account_type: string
          allows_movement?: boolean | null
          created_at?: string | null
          enterprise_id?: number | null
          id?: number
          is_active?: boolean | null
          is_detail_account?: boolean | null
          level: number
          parent_account_id?: number | null
          requires_cost_center?: boolean | null
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string
          allows_movement?: boolean | null
          created_at?: string | null
          enterprise_id?: number | null
          id?: number
          is_active?: boolean | null
          is_detail_account?: boolean | null
          level?: number
          parent_account_id?: number | null
          requires_cost_center?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_accounts_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_audit_log: {
        Row: {
          action: string
          created_at: string | null
          enterprise_id: number | null
          id: number
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          record_id: number | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          enterprise_id?: number | null
          id?: number
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: number | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          enterprise_id?: number | null
          id?: number
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: number | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_audit_log_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tab_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_bank_accounts: {
        Row: {
          account_id: number | null
          account_number: string
          account_type: string | null
          bank_name: string
          created_at: string | null
          currency_id: number | null
          enterprise_id: number | null
          id: number
          is_active: boolean | null
        }
        Insert: {
          account_id?: number | null
          account_number: string
          account_type?: string | null
          bank_name: string
          created_at?: string | null
          currency_id?: number | null
          enterprise_id?: number | null
          id?: number
          is_active?: boolean | null
        }
        Update: {
          account_id?: number | null
          account_number?: string
          account_type?: string | null
          bank_name?: string
          created_at?: string | null
          currency_id?: number | null
          enterprise_id?: number | null
          id?: number
          is_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_bank_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_bank_accounts_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "tab_currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_bank_accounts_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_bank_movements: {
        Row: {
          balance: number | null
          bank_account_id: number | null
          created_at: string | null
          credit_amount: number | null
          debit_amount: number | null
          description: string
          id: number
          is_reconciled: boolean | null
          journal_entry_id: number | null
          movement_date: string
          reconciliation_id: number | null
          reference: string | null
        }
        Insert: {
          balance?: number | null
          bank_account_id?: number | null
          created_at?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          description: string
          id?: number
          is_reconciled?: boolean | null
          journal_entry_id?: number | null
          movement_date: string
          reconciliation_id?: number | null
          reference?: string | null
        }
        Update: {
          balance?: number | null
          bank_account_id?: number | null
          created_at?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string
          id?: number
          is_reconciled?: boolean | null
          journal_entry_id?: number | null
          movement_date?: string
          reconciliation_id?: number | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_bank_movements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "tab_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_bank_movements_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_bank_movements_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "tab_bank_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_bank_reconciliations: {
        Row: {
          adjustments: number | null
          bank_account_id: number | null
          bank_statement_balance: number
          book_balance: number
          created_at: string | null
          created_by: string | null
          id: number
          notes: string | null
          reconciled_balance: number
          reconciliation_date: string
          status: string | null
        }
        Insert: {
          adjustments?: number | null
          bank_account_id?: number | null
          bank_statement_balance: number
          book_balance: number
          created_at?: string | null
          created_by?: string | null
          id?: number
          notes?: string | null
          reconciled_balance: number
          reconciliation_date: string
          status?: string | null
        }
        Update: {
          adjustments?: number | null
          bank_account_id?: number | null
          bank_statement_balance?: number
          book_balance?: number
          created_at?: string | null
          created_by?: string | null
          id?: number
          notes?: string | null
          reconciled_balance?: number
          reconciliation_date?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_bank_reconciliations_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "tab_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_bank_reconciliations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tab_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_currencies: {
        Row: {
          currency_code: string
          currency_name: string
          id: number
          is_active: boolean | null
          symbol: string
        }
        Insert: {
          currency_code: string
          currency_name: string
          id?: number
          is_active?: boolean | null
          symbol: string
        }
        Update: {
          currency_code?: string
          currency_name?: string
          id?: number
          is_active?: boolean | null
          symbol?: string
        }
        Relationships: []
      }
      tab_enterprises: {
        Row: {
          address: string | null
          base_currency_code: string | null
          business_name: string
          created_at: string | null
          email: string | null
          fel_certificate_path: string | null
          id: number
          is_active: boolean | null
          nit: string
          phone: string | null
          tax_regime: string
          trade_name: string | null
        }
        Insert: {
          address?: string | null
          base_currency_code?: string | null
          business_name: string
          created_at?: string | null
          email?: string | null
          fel_certificate_path?: string | null
          id?: number
          is_active?: boolean | null
          nit: string
          phone?: string | null
          tax_regime: string
          trade_name?: string | null
        }
        Update: {
          address?: string | null
          base_currency_code?: string | null
          business_name?: string
          created_at?: string | null
          email?: string | null
          fel_certificate_path?: string | null
          id?: number
          is_active?: boolean | null
          nit?: string
          phone?: string | null
          tax_regime?: string
          trade_name?: string | null
        }
        Relationships: []
      }
      tab_exchange_rates: {
        Row: {
          created_at: string | null
          currency_from_id: number | null
          currency_to_id: number | null
          effective_date: string
          id: number
          rate: number
          source: string | null
        }
        Insert: {
          created_at?: string | null
          currency_from_id?: number | null
          currency_to_id?: number | null
          effective_date: string
          id?: number
          rate: number
          source?: string | null
        }
        Update: {
          created_at?: string | null
          currency_from_id?: number | null
          currency_to_id?: number | null
          effective_date?: string
          id?: number
          rate?: number
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_exchange_rates_currency_from_id_fkey"
            columns: ["currency_from_id"]
            isOneToOne: false
            referencedRelation: "tab_currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_exchange_rates_currency_to_id_fkey"
            columns: ["currency_to_id"]
            isOneToOne: false
            referencedRelation: "tab_currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_import_logs: {
        Row: {
          created_at: string | null
          enterprise_id: number | null
          error_log: Json | null
          file_name: string
          file_path: string | null
          id: number
          import_type: string
          imported_by: string | null
          records_failed: number | null
          records_imported: number | null
          records_total: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          enterprise_id?: number | null
          error_log?: Json | null
          file_name: string
          file_path?: string | null
          id?: number
          import_type: string
          imported_by?: string | null
          records_failed?: number | null
          records_imported?: number | null
          records_total?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          enterprise_id?: number | null
          error_log?: Json | null
          file_name?: string
          file_path?: string | null
          id?: number
          import_type?: string
          imported_by?: string | null
          records_failed?: number | null
          records_imported?: number | null
          records_total?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_import_logs_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_import_logs_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "tab_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_journal_entries: {
        Row: {
          accounting_period_id: number | null
          created_at: string | null
          created_by: string | null
          currency_id: number | null
          description: string
          document_reference: string | null
          enterprise_id: number | null
          entry_date: string
          entry_number: string
          entry_type: string
          exchange_rate: number | null
          id: number
          is_balanced: boolean | null
          is_posted: boolean | null
          posted_at: string | null
          total_credit: number
          total_debit: number
        }
        Insert: {
          accounting_period_id?: number | null
          created_at?: string | null
          created_by?: string | null
          currency_id?: number | null
          description: string
          document_reference?: string | null
          enterprise_id?: number | null
          entry_date: string
          entry_number: string
          entry_type: string
          exchange_rate?: number | null
          id?: number
          is_balanced?: boolean | null
          is_posted?: boolean | null
          posted_at?: string | null
          total_credit?: number
          total_debit?: number
        }
        Update: {
          accounting_period_id?: number | null
          created_at?: string | null
          created_by?: string | null
          currency_id?: number | null
          description?: string
          document_reference?: string | null
          enterprise_id?: number | null
          entry_date?: string
          entry_number?: string
          entry_type?: string
          exchange_rate?: number | null
          id?: number
          is_balanced?: boolean | null
          is_posted?: boolean | null
          posted_at?: string | null
          total_credit?: number
          total_debit?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_journal_entries_accounting_period_id_fkey"
            columns: ["accounting_period_id"]
            isOneToOne: false
            referencedRelation: "tab_accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tab_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_journal_entries_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "tab_currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_journal_entries_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_journal_entry_details: {
        Row: {
          account_id: number | null
          bank_reference: string | null
          cost_center: string | null
          credit_amount: number | null
          debit_amount: number | null
          description: string | null
          id: number
          journal_entry_id: number | null
          line_number: number
        }
        Insert: {
          account_id?: number | null
          bank_reference?: string | null
          cost_center?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          id?: number
          journal_entry_id?: number | null
          line_number: number
        }
        Update: {
          account_id?: number | null
          bank_reference?: string | null
          cost_center?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          id?: number
          journal_entry_id?: number | null
          line_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_journal_entry_details_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_journal_entry_details_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_purchase_ledger: {
        Row: {
          accounting_period_id: number | null
          authorization_number: string | null
          created_at: string | null
          currency_id: number | null
          enterprise_id: number | null
          exchange_rate: number | null
          fel_document_type: string | null
          id: number
          imported_from_fel: boolean | null
          invoice_date: string
          invoice_number: string
          invoice_series: string | null
          journal_entry_id: number | null
          net_amount: number
          purchase_type: string | null
          supplier_name: string
          supplier_nit: string
          total_amount: number
          vat_amount: number
        }
        Insert: {
          accounting_period_id?: number | null
          authorization_number?: string | null
          created_at?: string | null
          currency_id?: number | null
          enterprise_id?: number | null
          exchange_rate?: number | null
          fel_document_type?: string | null
          id?: number
          imported_from_fel?: boolean | null
          invoice_date: string
          invoice_number: string
          invoice_series?: string | null
          journal_entry_id?: number | null
          net_amount: number
          purchase_type?: string | null
          supplier_name: string
          supplier_nit: string
          total_amount: number
          vat_amount: number
        }
        Update: {
          accounting_period_id?: number | null
          authorization_number?: string | null
          created_at?: string | null
          currency_id?: number | null
          enterprise_id?: number | null
          exchange_rate?: number | null
          fel_document_type?: string | null
          id?: number
          imported_from_fel?: boolean | null
          invoice_date?: string
          invoice_number?: string
          invoice_series?: string | null
          journal_entry_id?: number | null
          net_amount?: number
          purchase_type?: string | null
          supplier_name?: string
          supplier_nit?: string
          total_amount?: number
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_purchase_ledger_accounting_period_id_fkey"
            columns: ["accounting_period_id"]
            isOneToOne: false
            referencedRelation: "tab_accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_purchase_ledger_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "tab_currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_purchase_ledger_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_purchase_ledger_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_sales_ledger: {
        Row: {
          accounting_period_id: number | null
          authorization_number: string
          created_at: string | null
          currency_id: number | null
          customer_name: string
          customer_nit: string
          enterprise_id: number | null
          exchange_rate: number | null
          fel_document_type: string
          fel_xml_path: string | null
          id: number
          imported_from_fel: boolean | null
          invoice_date: string
          invoice_number: string
          invoice_series: string | null
          journal_entry_id: number | null
          net_amount: number
          total_amount: number
          vat_amount: number
        }
        Insert: {
          accounting_period_id?: number | null
          authorization_number: string
          created_at?: string | null
          currency_id?: number | null
          customer_name: string
          customer_nit: string
          enterprise_id?: number | null
          exchange_rate?: number | null
          fel_document_type: string
          fel_xml_path?: string | null
          id?: number
          imported_from_fel?: boolean | null
          invoice_date: string
          invoice_number: string
          invoice_series?: string | null
          journal_entry_id?: number | null
          net_amount: number
          total_amount: number
          vat_amount: number
        }
        Update: {
          accounting_period_id?: number | null
          authorization_number?: string
          created_at?: string | null
          currency_id?: number | null
          customer_name?: string
          customer_nit?: string
          enterprise_id?: number | null
          exchange_rate?: number | null
          fel_document_type?: string
          fel_xml_path?: string | null
          id?: number
          imported_from_fel?: boolean | null
          invoice_date?: string
          invoice_number?: string
          invoice_series?: string | null
          journal_entry_id?: number | null
          net_amount?: number
          total_amount?: number
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_sales_ledger_accounting_period_id_fkey"
            columns: ["accounting_period_id"]
            isOneToOne: false
            referencedRelation: "tab_accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_sales_ledger_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "tab_currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_sales_ledger_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_sales_ledger_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_user_enterprises: {
        Row: {
          created_at: string | null
          enterprise_id: number | null
          id: number
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          enterprise_id?: number | null
          id?: number
          role: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          enterprise_id?: number | null
          id?: number
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_user_enterprises_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_user_enterprises_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tab_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          is_super_admin: boolean | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          is_active?: boolean | null
          is_super_admin?: boolean | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          is_super_admin?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
