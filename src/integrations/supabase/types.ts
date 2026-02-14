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
          is_default_period: boolean | null
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
          is_default_period?: boolean | null
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
          is_default_period?: boolean | null
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
          balance_type: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          enterprise_id: number | null
          id: number
          is_active: boolean | null
          is_bank_account: boolean | null
          level: number
          parent_account_id: number | null
          requires_cost_center: boolean | null
        }
        Insert: {
          account_code: string
          account_name: string
          account_type: string
          allows_movement?: boolean | null
          balance_type?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          enterprise_id?: number | null
          id?: number
          is_active?: boolean | null
          is_bank_account?: boolean | null
          level: number
          parent_account_id?: number | null
          requires_cost_center?: boolean | null
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string
          allows_movement?: boolean | null
          balance_type?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          enterprise_id?: number | null
          id?: number
          is_active?: boolean | null
          is_bank_account?: boolean | null
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
      tab_alert_config: {
        Row: {
          alert_type: string
          created_at: string | null
          days_before: number | null
          enterprise_id: number | null
          id: number
          is_enabled: boolean | null
          send_email: boolean | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          days_before?: number | null
          enterprise_id?: number | null
          id?: never
          is_enabled?: boolean | null
          send_email?: boolean | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          days_before?: number | null
          enterprise_id?: number | null
          id?: never
          is_enabled?: boolean | null
          send_email?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_alert_config_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
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
      tab_bank_import_templates: {
        Row: {
          bank_account_id: number | null
          column_mapping: Json
          created_at: string
          enterprise_id: number
          header_row: number | null
          id: number
          template_name: string
          updated_at: string
        }
        Insert: {
          bank_account_id?: number | null
          column_mapping: Json
          created_at?: string
          enterprise_id: number
          header_row?: number | null
          id?: never
          template_name: string
          updated_at?: string
        }
        Update: {
          bank_account_id?: number | null
          column_mapping?: Json
          created_at?: string
          enterprise_id?: number
          header_row?: number | null
          id?: never
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_bank_import_templates_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_bank_import_templates_enterprise_id_fkey"
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
          enterprise_id: number | null
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
          enterprise_id?: number | null
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
          enterprise_id?: number | null
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
            foreignKeyName: "tab_bank_movements_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
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
      tab_custom_reminders: {
        Row: {
          created_at: string | null
          description: string | null
          enterprise_id: number | null
          id: number
          is_completed: boolean | null
          priority: string | null
          reminder_date: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          enterprise_id?: number | null
          id?: never
          is_completed?: boolean | null
          priority?: string | null
          reminder_date: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          enterprise_id?: number | null
          id?: never
          is_completed?: boolean | null
          priority?: string | null
          reminder_date?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_custom_reminders_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_enterprise_config: {
        Row: {
          cost_of_sales_account_id: number | null
          cost_of_sales_method: string | null
          created_at: string | null
          customers_account_id: number | null
          enterprise_id: number
          final_inventory_account_id: number | null
          id: number
          initial_inventory_account_id: number | null
          inventory_account_id: number | null
          period_result_account_id: number | null
          purchases_account_id: number | null
          sales_account_id: number | null
          suppliers_account_id: number | null
          vat_credit_account_id: number | null
          vat_debit_account_id: number | null
        }
        Insert: {
          cost_of_sales_account_id?: number | null
          cost_of_sales_method?: string | null
          created_at?: string | null
          customers_account_id?: number | null
          enterprise_id: number
          final_inventory_account_id?: number | null
          id?: never
          initial_inventory_account_id?: number | null
          inventory_account_id?: number | null
          period_result_account_id?: number | null
          purchases_account_id?: number | null
          sales_account_id?: number | null
          suppliers_account_id?: number | null
          vat_credit_account_id?: number | null
          vat_debit_account_id?: number | null
        }
        Update: {
          cost_of_sales_account_id?: number | null
          cost_of_sales_method?: string | null
          created_at?: string | null
          customers_account_id?: number | null
          enterprise_id?: number
          final_inventory_account_id?: number | null
          id?: never
          initial_inventory_account_id?: number | null
          inventory_account_id?: number | null
          period_result_account_id?: number | null
          purchases_account_id?: number | null
          sales_account_id?: number | null
          suppliers_account_id?: number | null
          vat_credit_account_id?: number | null
          vat_debit_account_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_enterprise_config_cost_of_sales_account_id_fkey"
            columns: ["cost_of_sales_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_enterprise_config_inventory_account_id_fkey"
            columns: ["inventory_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_enterprise_documents: {
        Row: {
          created_at: string | null
          document_name: string
          document_type: string
          enterprise_id: number
          file_name: string
          file_path: string
          file_size: number
          id: number
          is_active: boolean | null
          notes: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          document_name: string
          document_type: string
          enterprise_id: number
          file_name: string
          file_path: string
          file_size: number
          id?: never
          is_active?: boolean | null
          notes?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          document_name?: string
          document_type?: string
          enterprise_id?: number
          file_name?: string
          file_path?: string
          file_size?: number
          id?: never
          is_active?: boolean | null
          notes?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      tab_enterprise_tax_config: {
        Row: {
          created_at: string | null
          enterprise_id: number
          id: number
          is_active: boolean | null
          tax_form_type: string
          tax_rate: number | null
        }
        Insert: {
          created_at?: string | null
          enterprise_id: number
          id?: number
          is_active?: boolean | null
          tax_form_type: string
          tax_rate?: number | null
        }
        Update: {
          created_at?: string | null
          enterprise_id?: number
          id?: number
          is_active?: boolean | null
          tax_form_type?: string
          tax_rate?: number | null
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
          tenant_id: number
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
          tenant_id: number
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
          tenant_id?: number
          trade_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_enterprises_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tab_tenants"
            referencedColumns: ["id"]
          },
        ]
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
      tab_fel_document_types: {
        Row: {
          affects_total: number
          applies_vat: boolean
          code: string
          created_at: string | null
          id: number
          is_active: boolean | null
          name: string
        }
        Insert: {
          affects_total?: number
          applies_vat?: boolean
          code: string
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          name: string
        }
        Update: {
          affects_total?: number
          applies_vat?: boolean
          code?: string
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      tab_financial_statement_formats: {
        Row: {
          created_at: string | null
          enterprise_id: number
          format_type: string
          id: number
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          enterprise_id: number
          format_type: string
          id?: never
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          enterprise_id?: number
          format_type?: string
          id?: never
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      tab_financial_statement_section_accounts: {
        Row: {
          account_id: number
          created_at: string | null
          display_order: number
          id: number
          include_children: boolean | null
          section_id: number
          sign_multiplier: number | null
        }
        Insert: {
          account_id: number
          created_at?: string | null
          display_order: number
          id?: never
          include_children?: boolean | null
          section_id: number
          sign_multiplier?: number | null
        }
        Update: {
          account_id?: number
          created_at?: string | null
          display_order?: number
          id?: never
          include_children?: boolean | null
          section_id?: number
          sign_multiplier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_financial_statement_section_accounts_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "tab_financial_statement_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_financial_statement_sections: {
        Row: {
          created_at: string | null
          display_order: number
          format_id: number
          id: number
          section_name: string
          section_type: string
          show_in_report: boolean | null
        }
        Insert: {
          created_at?: string | null
          display_order: number
          format_id: number
          id?: never
          section_name: string
          section_type: string
          show_in_report?: boolean | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          format_id?: number
          id?: never
          section_name?: string
          section_type?: string
          show_in_report?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_financial_statement_sections_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "tab_financial_statement_formats"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_holidays: {
        Row: {
          created_at: string | null
          description: string
          enterprise_id: number | null
          holiday_date: string
          id: number
          is_recurring: boolean | null
        }
        Insert: {
          created_at?: string | null
          description: string
          enterprise_id?: number | null
          holiday_date: string
          id?: never
          is_recurring?: boolean | null
        }
        Update: {
          created_at?: string | null
          description?: string
          enterprise_id?: number | null
          holiday_date?: string
          id?: never
          is_recurring?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_holidays_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
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
          bank_account_id: number | null
          bank_reference: string | null
          beneficiary_name: string | null
          created_at: string | null
          created_by: string | null
          currency_id: number | null
          deleted_at: string | null
          deleted_by: string | null
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
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          total_credit: number
          total_debit: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          accounting_period_id?: number | null
          bank_account_id?: number | null
          bank_reference?: string | null
          beneficiary_name?: string | null
          created_at?: string | null
          created_by?: string | null
          currency_id?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          total_credit?: number
          total_debit?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          accounting_period_id?: number | null
          bank_account_id?: number | null
          bank_reference?: string | null
          beneficiary_name?: string | null
          created_at?: string | null
          created_by?: string | null
          currency_id?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          total_credit?: number
          total_debit?: number
          updated_at?: string | null
          updated_by?: string | null
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
            foreignKeyName: "tab_journal_entries_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
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
          {
            foreignKeyName: "tab_journal_entries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "tab_users"
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
      tab_journal_entry_history: {
        Row: {
          change_summary: string | null
          change_type: string
          changed_at: string
          changed_by: string | null
          enterprise_id: number | null
          id: number
          journal_entry_id: number
          new_details: Json | null
          new_header: Json | null
          old_details: Json | null
          old_header: Json | null
        }
        Insert: {
          change_summary?: string | null
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          enterprise_id?: number | null
          id?: never
          journal_entry_id: number
          new_details?: Json | null
          new_header?: Json | null
          old_details?: Json | null
          old_header?: Json | null
        }
        Update: {
          change_summary?: string | null
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          enterprise_id?: number | null
          id?: never
          journal_entry_id?: number
          new_details?: Json | null
          new_header?: Json | null
          old_details?: Json | null
          old_header?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_journal_entry_history_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_journal_entry_history_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_journal_entry_prefixes: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: number
          is_active: boolean | null
          name: string
          prefix: string
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: never
          is_active?: boolean | null
          name: string
          prefix: string
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: never
          is_active?: boolean | null
          name?: string
          prefix?: string
        }
        Relationships: []
      }
      tab_notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          description: string | null
          enterprise_id: number | null
          event_date: string | null
          id: number
          is_read: boolean | null
          notification_type: string
          priority: string
          read_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          description?: string | null
          enterprise_id?: number | null
          event_date?: string | null
          id?: never
          is_read?: boolean | null
          notification_type: string
          priority?: string
          read_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          description?: string | null
          enterprise_id?: number | null
          event_date?: string | null
          id?: never
          is_read?: boolean | null
          notification_type?: string
          priority?: string
          read_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_notifications_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_operation_types: {
        Row: {
          applies_to: string
          code: string
          created_at: string | null
          description: string | null
          enterprise_id: number | null
          id: number
          is_active: boolean | null
          is_system: boolean | null
          name: string
        }
        Insert: {
          applies_to: string
          code: string
          created_at?: string | null
          description?: string | null
          enterprise_id?: number | null
          id?: number
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
        }
        Update: {
          applies_to?: string
          code?: string
          created_at?: string | null
          description?: string | null
          enterprise_id?: number | null
          id?: number
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_operation_types_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_period_inventory_closing: {
        Row: {
          accounting_period_id: number
          calculated_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          cost_of_sales_amount: number | null
          created_at: string | null
          enterprise_id: number
          final_inventory_amount: number | null
          id: number
          initial_inventory_amount: number
          journal_entry_id: number | null
          purchases_amount: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          accounting_period_id: number
          calculated_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          cost_of_sales_amount?: number | null
          created_at?: string | null
          enterprise_id: number
          final_inventory_amount?: number | null
          id?: number
          initial_inventory_amount?: number
          journal_entry_id?: number | null
          purchases_amount?: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          accounting_period_id?: number
          calculated_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          cost_of_sales_amount?: number | null
          created_at?: string | null
          enterprise_id?: number
          final_inventory_amount?: number | null
          id?: number
          initial_inventory_amount?: number
          journal_entry_id?: number | null
          purchases_amount?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_period_inventory_closing_accounting_period_id_fkey"
            columns: ["accounting_period_id"]
            isOneToOne: false
            referencedRelation: "tab_accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_period_inventory_closing_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_period_inventory_closing_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_purchase_books: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
          created_by: string | null
          enterprise_id: number
          id: number
          month: number
          notes: string | null
          status: string | null
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          enterprise_id: number
          id?: number
          month: number
          notes?: string | null
          status?: string | null
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          enterprise_id?: number
          id?: number
          month?: number
          notes?: string | null
          status?: string | null
          year?: number
        }
        Relationships: []
      }
      tab_purchase_ledger: {
        Row: {
          accounting_period_id: number | null
          bank_account_id: number | null
          base_amount: number | null
          batch_reference: string | null
          created_at: string | null
          currency_id: number | null
          deleted_at: string | null
          deleted_by: string | null
          enterprise_id: number | null
          exchange_rate: number | null
          expense_account_id: number | null
          fel_document_type: string | null
          id: number
          idp_amount: number | null
          imported_from_fel: boolean | null
          invoice_date: string
          invoice_number: string
          invoice_series: string | null
          journal_entry_id: number | null
          net_amount: number
          operation_type_id: number | null
          purchase_book_id: number | null
          purchase_type: string | null
          supplier_name: string
          supplier_nit: string
          total_amount: number
          vat_amount: number
        }
        Insert: {
          accounting_period_id?: number | null
          bank_account_id?: number | null
          base_amount?: number | null
          batch_reference?: string | null
          created_at?: string | null
          currency_id?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          enterprise_id?: number | null
          exchange_rate?: number | null
          expense_account_id?: number | null
          fel_document_type?: string | null
          id?: number
          idp_amount?: number | null
          imported_from_fel?: boolean | null
          invoice_date: string
          invoice_number: string
          invoice_series?: string | null
          journal_entry_id?: number | null
          net_amount: number
          operation_type_id?: number | null
          purchase_book_id?: number | null
          purchase_type?: string | null
          supplier_name: string
          supplier_nit: string
          total_amount: number
          vat_amount: number
        }
        Update: {
          accounting_period_id?: number | null
          bank_account_id?: number | null
          base_amount?: number | null
          batch_reference?: string | null
          created_at?: string | null
          currency_id?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          enterprise_id?: number | null
          exchange_rate?: number | null
          expense_account_id?: number | null
          fel_document_type?: string | null
          id?: number
          idp_amount?: number | null
          imported_from_fel?: boolean | null
          invoice_date?: string
          invoice_number?: string
          invoice_series?: string | null
          journal_entry_id?: number | null
          net_amount?: number
          operation_type_id?: number | null
          purchase_book_id?: number | null
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
            foreignKeyName: "tab_purchase_ledger_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
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
            foreignKeyName: "tab_purchase_ledger_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_purchase_ledger_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_purchase_ledger_operation_type_id_fkey"
            columns: ["operation_type_id"]
            isOneToOne: false
            referencedRelation: "tab_operation_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_purchase_ledger_purchase_book_id_fkey"
            columns: ["purchase_book_id"]
            isOneToOne: false
            referencedRelation: "tab_purchase_books"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_role_permissions: {
        Row: {
          created_at: string | null
          enterprise_id: number | null
          id: number
          is_enabled: boolean | null
          permission_key: string
          role_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enterprise_id?: number | null
          id?: never
          is_enabled?: boolean | null
          permission_key: string
          role_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enterprise_id?: number | null
          id?: never
          is_enabled?: boolean | null
          permission_key?: string
          role_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_role_permissions_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
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
          deleted_at: string | null
          deleted_by: string | null
          enterprise_id: number | null
          establishment_code: string | null
          establishment_name: string | null
          exchange_rate: number | null
          fel_document_type: string
          fel_xml_path: string | null
          id: number
          imported_from_fel: boolean | null
          income_account_id: number | null
          invoice_date: string
          invoice_number: string
          invoice_series: string | null
          is_annulled: boolean
          journal_entry_id: number | null
          net_amount: number
          operation_type_id: number | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          enterprise_id?: number | null
          establishment_code?: string | null
          establishment_name?: string | null
          exchange_rate?: number | null
          fel_document_type: string
          fel_xml_path?: string | null
          id?: number
          imported_from_fel?: boolean | null
          income_account_id?: number | null
          invoice_date: string
          invoice_number: string
          invoice_series?: string | null
          is_annulled?: boolean
          journal_entry_id?: number | null
          net_amount: number
          operation_type_id?: number | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          enterprise_id?: number | null
          establishment_code?: string | null
          establishment_name?: string | null
          exchange_rate?: number | null
          fel_document_type?: string
          fel_xml_path?: string | null
          id?: number
          imported_from_fel?: boolean | null
          income_account_id?: number | null
          invoice_date?: string
          invoice_number?: string
          invoice_series?: string | null
          is_annulled?: boolean
          journal_entry_id?: number | null
          net_amount?: number
          operation_type_id?: number | null
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
            foreignKeyName: "tab_sales_ledger_income_account_id_fkey"
            columns: ["income_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_sales_ledger_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_sales_ledger_operation_type_id_fkey"
            columns: ["operation_type_id"]
            isOneToOne: false
            referencedRelation: "tab_operation_types"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_tax_due_date_config: {
        Row: {
          calculation_type: string
          consider_holidays: boolean | null
          created_at: string | null
          days_value: number | null
          display_order: number | null
          enterprise_id: number | null
          id: number
          is_active: boolean | null
          reference_period: string
          tax_label: string
          tax_type: string
        }
        Insert: {
          calculation_type: string
          consider_holidays?: boolean | null
          created_at?: string | null
          days_value?: number | null
          display_order?: number | null
          enterprise_id?: number | null
          id?: never
          is_active?: boolean | null
          reference_period?: string
          tax_label: string
          tax_type: string
        }
        Update: {
          calculation_type?: string
          consider_holidays?: boolean | null
          created_at?: string | null
          days_value?: number | null
          display_order?: number | null
          enterprise_id?: number | null
          id?: never
          is_active?: boolean | null
          reference_period?: string
          tax_label?: string
          tax_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_tax_due_date_config_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_tax_forms: {
        Row: {
          access_code: string
          amount_paid: number
          created_at: string | null
          created_by: string | null
          enterprise_id: number
          file_name: string | null
          file_path: string | null
          file_size: number | null
          form_number: string
          id: number
          is_active: boolean | null
          notes: string | null
          payment_date: string
          period_month: number | null
          period_type: string | null
          period_year: number | null
          tax_type: string | null
        }
        Insert: {
          access_code: string
          amount_paid?: number
          created_at?: string | null
          created_by?: string | null
          enterprise_id: number
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          form_number: string
          id?: never
          is_active?: boolean | null
          notes?: string | null
          payment_date: string
          period_month?: number | null
          period_type?: string | null
          period_year?: number | null
          tax_type?: string | null
        }
        Update: {
          access_code?: string
          amount_paid?: number
          created_at?: string | null
          created_by?: string | null
          enterprise_id?: number
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          form_number?: string
          id?: never
          is_active?: boolean | null
          notes?: string | null
          payment_date?: string
          period_month?: number | null
          period_type?: string | null
          period_year?: number | null
          tax_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_tax_forms_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_tenants: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          id: number
          is_active: boolean | null
          logo_url: string | null
          max_enterprises: number | null
          max_users: number | null
          pdf_font_family: string
          pdf_font_size: number
          plan_expires_at: string | null
          plan_type: string | null
          primary_color: string | null
          secondary_color: string | null
          subdomain: string | null
          tenant_code: string
          tenant_name: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          logo_url?: string | null
          max_enterprises?: number | null
          max_users?: number | null
          pdf_font_family?: string
          pdf_font_size?: number
          plan_expires_at?: string | null
          plan_type?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          subdomain?: string | null
          tenant_code: string
          tenant_name: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          logo_url?: string | null
          max_enterprises?: number | null
          max_users?: number | null
          pdf_font_family?: string
          pdf_font_size?: number
          plan_expires_at?: string | null
          plan_type?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          subdomain?: string | null
          tenant_code?: string
          tenant_name?: string
        }
        Relationships: []
      }
      tab_user_enterprises: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          enterprise_id: number | null
          id: number
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          enterprise_id?: number | null
          id?: number
          role: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
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
          current_enterprise_name: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          is_super_admin: boolean | null
          is_system_user: boolean | null
          is_tenant_admin: boolean | null
          last_activity_at: string | null
          last_enterprise_id: number | null
          tenant_id: number
        }
        Insert: {
          created_at?: string | null
          current_enterprise_name?: string | null
          email: string
          full_name: string
          id?: string
          is_active?: boolean | null
          is_super_admin?: boolean | null
          is_system_user?: boolean | null
          is_tenant_admin?: boolean | null
          last_activity_at?: string | null
          last_enterprise_id?: number | null
          tenant_id: number
        }
        Update: {
          created_at?: string | null
          current_enterprise_name?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          is_super_admin?: boolean | null
          is_system_user?: boolean | null
          is_tenant_admin?: boolean | null
          last_activity_at?: string | null
          last_enterprise_id?: number | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_users_last_enterprise_id_fkey"
            columns: ["last_enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tab_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          enterprise_id: number | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enterprise_id?: number | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          enterprise_id?: number | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_tenant: {
        Args: { check_tenant_id: number; user_uuid: string }
        Returns: boolean
      }
      can_approve_entries: {
        Args: { _enterprise_id: number; _user_id: string }
        Returns: boolean
      }
      can_manage_user_enterprise_link: {
        Args: {
          actor_user_id: string
          target_enterprise_id: number
          target_user_id: string
        }
        Returns: boolean
      }
      can_post_entries: {
        Args: { _enterprise_id: number; _user_id: string }
        Returns: boolean
      }
      create_enterprise_with_user_link:
        | {
            Args: {
              _address?: string
              _base_currency_code?: string
              _business_name: string
              _email?: string
              _is_active?: boolean
              _nit: string
              _phone?: string
              _tax_regime: string
              _tenant_id?: number
              _trade_name?: string
            }
            Returns: Json
          }
        | {
            Args: {
              _address?: string
              _base_currency_code: string
              _business_name: string
              _email?: string
              _is_active: boolean
              _nit: string
              _phone?: string
              _tax_regime: string
              _trade_name?: string
            }
            Returns: Json
          }
      get_enterprise_tenant_id: {
        Args: { _enterprise_id: number }
        Returns: number
      }
      get_user_role: {
        Args: { _enterprise_id: number; _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_tenant_id: { Args: { user_uuid: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_default_permissions: {
        Args: { p_enterprise_id: number }
        Returns: undefined
      }
      is_admin_for_enterprise: {
        Args: { _enterprise_id: number; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin_bypass: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_active: { Args: { tenant_id_param: number }; Returns: boolean }
      is_tenant_admin_for: {
        Args: { check_tenant_id: number; user_uuid: string }
        Returns: boolean
      }
      is_tenant_admin_for_bypass: {
        Args: { check_tenant_id: number; user_uuid: string }
        Returns: boolean
      }
      user_is_linked_to_enterprise: {
        Args: { _enterprise_id: number; _user_id: string }
        Returns: boolean
      }
      validate_invoice_date: {
        Args: { book_month: number; book_year: number; invoice_date: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "enterprise_admin"
        | "accountant"
        | "auditor"
        | "viewer"
        | "contador_senior"
        | "auxiliar_contable"
        | "cliente"
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
    Enums: {
      app_role: [
        "super_admin",
        "enterprise_admin",
        "accountant",
        "auditor",
        "viewer",
        "contador_senior",
        "auxiliar_contable",
        "cliente",
      ],
    },
  },
} as const
