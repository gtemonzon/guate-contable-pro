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
      audit_event_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          enterprise_id: number | null
          entity_id: number | null
          entity_type: string
          id: number
          metadata_json: Json | null
          prev_row_hash: string | null
          request_id: string | null
          row_hash: string | null
          tenant_id: number | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          enterprise_id?: number | null
          entity_id?: number | null
          entity_type: string
          id?: number
          metadata_json?: Json | null
          prev_row_hash?: string | null
          request_id?: string | null
          row_hash?: string | null
          tenant_id?: number | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          enterprise_id?: number | null
          entity_id?: number | null
          entity_type?: string
          id?: number
          metadata_json?: Json | null
          prev_row_hash?: string | null
          request_id?: string | null
          row_hash?: string | null
          tenant_id?: number | null
        }
        Relationships: []
      }
      fixed_asset_categories: {
        Row: {
          accumulated_depreciation_account_id: number | null
          asset_account_id: number | null
          code: string
          created_at: string
          default_residual_value: number
          default_useful_life_months: number
          depreciation_expense_account_id: number | null
          enterprise_id: number
          gain_loss_on_disposal_account_id: number | null
          id: number
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          accumulated_depreciation_account_id?: number | null
          asset_account_id?: number | null
          code: string
          created_at?: string
          default_residual_value?: number
          default_useful_life_months?: number
          depreciation_expense_account_id?: number | null
          enterprise_id: number
          gain_loss_on_disposal_account_id?: number | null
          id?: number
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          accumulated_depreciation_account_id?: number | null
          asset_account_id?: number | null
          code?: string
          created_at?: string
          default_residual_value?: number
          default_useful_life_months?: number
          depreciation_expense_account_id?: number | null
          enterprise_id?: number
          gain_loss_on_disposal_account_id?: number | null
          id?: number
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_categories_accumulated_depreciation_account_id_fkey"
            columns: ["accumulated_depreciation_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_categories_asset_account_id_fkey"
            columns: ["asset_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_categories_depreciation_expense_account_id_fkey"
            columns: ["depreciation_expense_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_categories_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_categories_gain_loss_on_disposal_account_id_fkey"
            columns: ["gain_loss_on_disposal_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_custodians: {
        Row: {
          contact: string | null
          created_at: string
          enterprise_id: number
          id: number
          identifier: string | null
          is_active: boolean
          name: string
          notes: string | null
        }
        Insert: {
          contact?: string | null
          created_at?: string
          enterprise_id: number
          id?: number
          identifier?: string | null
          is_active?: boolean
          name: string
          notes?: string | null
        }
        Update: {
          contact?: string | null
          created_at?: string
          enterprise_id?: number
          id?: number
          identifier?: string | null
          is_active?: boolean
          name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_custodians_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_depreciation_schedule: {
        Row: {
          accumulated_depreciation: number
          asset_id: number
          created_at: string
          enterprise_id: number
          id: number
          journal_entry_id: number | null
          month: number
          net_book_value: number
          planned_depreciation_amount: number
          posted_at: string | null
          posted_depreciation_amount: number | null
          posting_run_id: string | null
          status: string
          year: number
        }
        Insert: {
          accumulated_depreciation: number
          asset_id: number
          created_at?: string
          enterprise_id: number
          id?: number
          journal_entry_id?: number | null
          month: number
          net_book_value: number
          planned_depreciation_amount: number
          posted_at?: string | null
          posted_depreciation_amount?: number | null
          posting_run_id?: string | null
          status?: string
          year: number
        }
        Update: {
          accumulated_depreciation?: number
          asset_id?: number
          created_at?: string
          enterprise_id?: number
          id?: number
          journal_entry_id?: number | null
          month?: number
          net_book_value?: number
          planned_depreciation_amount?: number
          posted_at?: string | null
          posted_depreciation_amount?: number | null
          posting_run_id?: string | null
          status?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_depreciation_schedule_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_depreciation_schedule_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_depreciation_schedule_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_disposal_reasons: {
        Row: {
          code: string
          id: number
          name: string
        }
        Insert: {
          code: string
          id?: number
          name: string
        }
        Update: {
          code?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      fixed_asset_event_log: {
        Row: {
          actor_user_id: string | null
          asset_id: number
          created_at: string
          enterprise_id: number
          event_type: string
          id: number
          metadata_json: Json | null
        }
        Insert: {
          actor_user_id?: string | null
          asset_id: number
          created_at?: string
          enterprise_id: number
          event_type: string
          id?: number
          metadata_json?: Json | null
        }
        Update: {
          actor_user_id?: string | null
          asset_id?: number
          created_at?: string
          enterprise_id?: number
          event_type?: string
          id?: number
          metadata_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_event_log_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_event_log_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_locations: {
        Row: {
          code: string
          created_at: string
          description: string | null
          enterprise_id: number
          id: number
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          enterprise_id: number
          id?: number
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          enterprise_id?: number
          id?: number
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_locations_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_policy: {
        Row: {
          accounting_standard_mode: string
          allow_mid_month_disposal_proration: boolean
          created_at: string
          depreciation_method: string
          depreciation_start_rule: string
          enterprise_id: number
          id: number
          posting_frequency: string
          rounding_decimals: number
          updated_at: string
        }
        Insert: {
          accounting_standard_mode?: string
          allow_mid_month_disposal_proration?: boolean
          created_at?: string
          depreciation_method?: string
          depreciation_start_rule?: string
          enterprise_id: number
          id?: number
          posting_frequency?: string
          rounding_decimals?: number
          updated_at?: string
        }
        Update: {
          accounting_standard_mode?: string
          allow_mid_month_disposal_proration?: boolean
          created_at?: string
          depreciation_method?: string
          depreciation_start_rule?: string
          enterprise_id?: number
          id?: number
          posting_frequency?: string
          rounding_decimals?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_policy_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: true
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          enterprise_id: number
          id: number
          is_active: boolean
          name: string
          phone: string | null
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          enterprise_id: number
          id?: number
          is_active?: boolean
          name: string
          phone?: string | null
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          enterprise_id?: number
          id?: number
          is_active?: boolean
          name?: string
          phone?: string | null
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_suppliers_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          acquisition_cost: number
          acquisition_date: string
          activated_at: string | null
          activated_by: string | null
          asset_code: string
          asset_name: string
          category_id: number
          cost_center: string | null
          created_at: string
          created_by: string
          currency: string
          custodian_id: number | null
          disposal_je_id: number | null
          disposal_proceeds: number | null
          disposal_reason_id: number | null
          disposed_at: string | null
          enterprise_id: number
          exchange_rate_at_acquisition: number | null
          id: number
          in_service_date: string | null
          location_id: number | null
          notes: string | null
          original_acquisition_cost: number | null
          original_residual_value: number | null
          purchase_reference_id: number | null
          residual_value: number
          status: string
          supplier_id: number | null
          tenant_id: number
          updated_at: string
          useful_life_months: number
        }
        Insert: {
          acquisition_cost: number
          acquisition_date: string
          activated_at?: string | null
          activated_by?: string | null
          asset_code: string
          asset_name: string
          category_id: number
          cost_center?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          custodian_id?: number | null
          disposal_je_id?: number | null
          disposal_proceeds?: number | null
          disposal_reason_id?: number | null
          disposed_at?: string | null
          enterprise_id: number
          exchange_rate_at_acquisition?: number | null
          id?: number
          in_service_date?: string | null
          location_id?: number | null
          notes?: string | null
          original_acquisition_cost?: number | null
          original_residual_value?: number | null
          purchase_reference_id?: number | null
          residual_value?: number
          status?: string
          supplier_id?: number | null
          tenant_id: number
          updated_at?: string
          useful_life_months: number
        }
        Update: {
          acquisition_cost?: number
          acquisition_date?: string
          activated_at?: string | null
          activated_by?: string | null
          asset_code?: string
          asset_name?: string
          category_id?: number
          cost_center?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          custodian_id?: number | null
          disposal_je_id?: number | null
          disposal_proceeds?: number | null
          disposal_reason_id?: number | null
          disposed_at?: string | null
          enterprise_id?: number
          exchange_rate_at_acquisition?: number | null
          id?: number
          in_service_date?: string | null
          location_id?: number | null
          notes?: string | null
          original_acquisition_cost?: number | null
          original_residual_value?: number | null
          purchase_reference_id?: number | null
          residual_value?: number
          status?: string
          supplier_id?: number | null
          tenant_id?: number
          updated_at?: string
          useful_life_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_custodian_id_fkey"
            columns: ["custodian_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_custodians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_disposal_je_id_fkey"
            columns: ["disposal_je_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_disposal_reason_id_fkey"
            columns: ["disposal_reason_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_disposal_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_counters: {
        Row: {
          enterprise_id: number
          last_number: number
          month: number
          prefix: string
          updated_at: string
          year: number
        }
        Insert: {
          enterprise_id: number
          last_number?: number
          month?: number
          prefix: string
          updated_at?: string
          year: number
        }
        Update: {
          enterprise_id?: number
          last_number?: number
          month?: number
          prefix?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
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
          is_monetary: boolean
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
          is_monetary?: boolean
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
          is_monetary?: boolean
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
      tab_backup_history: {
        Row: {
          backup_type: string
          created_at: string
          created_by: string
          enterprise_id: number
          file_name: string
          id: number
          metadata: Json | null
          record_count: number
        }
        Insert: {
          backup_type: string
          created_at?: string
          created_by: string
          enterprise_id: number
          file_name: string
          id?: number
          metadata?: Json | null
          record_count?: number
        }
        Update: {
          backup_type?: string
          created_at?: string
          created_by?: string
          enterprise_id?: number
          file_name?: string
          id?: number
          metadata?: Json | null
          record_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_backup_history_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
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
          currency_code: string | null
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
          currency_code?: string | null
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
          currency_code?: string | null
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
      tab_bank_documents: {
        Row: {
          bank_account_id: number | null
          beneficiary_name: string | null
          concept: string | null
          created_at: string
          created_by: string | null
          direction: string
          document_date: string
          document_number: string
          enterprise_id: number
          id: number
          journal_entry_id: number | null
          reversal_journal_entry_id: number | null
          status: string
          updated_at: string
          void_date: string | null
          void_reason: string | null
        }
        Insert: {
          bank_account_id?: number | null
          beneficiary_name?: string | null
          concept?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          document_date: string
          document_number: string
          enterprise_id: number
          id?: never
          journal_entry_id?: number | null
          reversal_journal_entry_id?: number | null
          status?: string
          updated_at?: string
          void_date?: string | null
          void_reason?: string | null
        }
        Update: {
          bank_account_id?: number | null
          beneficiary_name?: string | null
          concept?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          document_date?: string
          document_number?: string
          enterprise_id?: number
          id?: never
          journal_entry_id?: number | null
          reversal_journal_entry_id?: number | null
          status?: string
          updated_at?: string
          void_date?: string | null
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_bank_documents_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "tab_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_bank_documents_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_bank_documents_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_bank_documents_reversal_journal_entry_id_fkey"
            columns: ["reversal_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
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
      tab_bank_reconciliation_adjustments: {
        Row: {
          adjustment_date: string | null
          adjustment_type: string
          affects_side: string
          amount: number
          created_at: string
          created_by: string | null
          description: string
          document_reference: string | null
          enterprise_id: number
          id: number
          reconciliation_id: number
        }
        Insert: {
          adjustment_date?: string | null
          adjustment_type: string
          affects_side: string
          amount: number
          created_at?: string
          created_by?: string | null
          description: string
          document_reference?: string | null
          enterprise_id: number
          id?: number
          reconciliation_id: number
        }
        Update: {
          adjustment_date?: string | null
          adjustment_type?: string
          affects_side?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string
          document_reference?: string | null
          enterprise_id?: number
          id?: number
          reconciliation_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_bank_reconciliation_adjustments_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "tab_bank_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_bank_reconciliation_quadratic: {
        Row: {
          auditor_colegiado_number: string | null
          auditor_name: string | null
          auditor_signature_date: string | null
          bank_account_id: number
          created_at: string
          created_by: string | null
          enterprise_id: number
          final_balance_bank: number
          final_balance_books: number
          id: number
          initial_balance_bank: number
          initial_balance_books: number
          reconciliation_id: number
          total_expenses_bank: number
          total_expenses_books: number
          total_income_bank: number
          total_income_books: number
          updated_at: string
        }
        Insert: {
          auditor_colegiado_number?: string | null
          auditor_name?: string | null
          auditor_signature_date?: string | null
          bank_account_id: number
          created_at?: string
          created_by?: string | null
          enterprise_id: number
          final_balance_bank?: number
          final_balance_books?: number
          id?: number
          initial_balance_bank?: number
          initial_balance_books?: number
          reconciliation_id: number
          total_expenses_bank?: number
          total_expenses_books?: number
          total_income_bank?: number
          total_income_books?: number
          updated_at?: string
        }
        Update: {
          auditor_colegiado_number?: string | null
          auditor_name?: string | null
          auditor_signature_date?: string | null
          bank_account_id?: number
          created_at?: string
          created_by?: string | null
          enterprise_id?: number
          final_balance_bank?: number
          final_balance_books?: number
          id?: number
          initial_balance_bank?: number
          initial_balance_books?: number
          reconciliation_id?: number
          total_expenses_bank?: number
          total_expenses_books?: number
          total_income_bank?: number
          total_income_books?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_bank_reconciliation_quadratic_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: true
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
      tab_book_authorizations: {
        Row: {
          authorization_date: string
          authorization_number: string
          authorized_folios: number
          book_type: string
          created_at: string
          created_by: string | null
          depleted_notified_at: string | null
          enterprise_id: number
          id: number
          is_active: boolean
          low_folios_notified_at: string | null
          manual_adjustment: number
          notes: string | null
          updated_at: string
        }
        Insert: {
          authorization_date: string
          authorization_number: string
          authorized_folios: number
          book_type: string
          created_at?: string
          created_by?: string | null
          depleted_notified_at?: string | null
          enterprise_id: number
          id?: never
          is_active?: boolean
          low_folios_notified_at?: string | null
          manual_adjustment?: number
          notes?: string | null
          updated_at?: string
        }
        Update: {
          authorization_date?: string
          authorization_number?: string
          authorized_folios?: number
          book_type?: string
          created_at?: string
          created_by?: string | null
          depleted_notified_at?: string | null
          enterprise_id?: number
          id?: never
          is_active?: boolean
          low_folios_notified_at?: string | null
          manual_adjustment?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_book_authorizations_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_book_folio_consumption: {
        Row: {
          authorization_id: number
          book_type: string
          created_at: string
          created_by: string | null
          enterprise_id: number
          id: number
          notes: string | null
          pages_used: number
          report_date_from: string | null
          report_date_to: string | null
          report_period: string | null
        }
        Insert: {
          authorization_id: number
          book_type: string
          created_at?: string
          created_by?: string | null
          enterprise_id: number
          id?: never
          notes?: string | null
          pages_used: number
          report_date_from?: string | null
          report_date_to?: string | null
          report_period?: string | null
        }
        Update: {
          authorization_id?: number
          book_type?: string
          created_at?: string
          created_by?: string | null
          enterprise_id?: number
          id?: never
          notes?: string | null
          pages_used?: number
          report_date_from?: string | null
          report_date_to?: string | null
          report_period?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_book_folio_consumption_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "tab_book_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_book_folio_consumption_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
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
      tab_dashboard_card_config: {
        Row: {
          card_order: string[] | null
          created_at: string | null
          enterprise_id: number
          id: number
          updated_at: string | null
          user_id: string
          visible_cards: string[]
        }
        Insert: {
          card_order?: string[] | null
          created_at?: string | null
          enterprise_id: number
          id?: number
          updated_at?: string | null
          user_id: string
          visible_cards?: string[]
        }
        Update: {
          card_order?: string[] | null
          created_at?: string | null
          enterprise_id?: number
          id?: number
          updated_at?: string | null
          user_id?: string
          visible_cards?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "tab_dashboard_card_config_enterprise_id_fkey"
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
          default_auditor_colegiado: string | null
          default_auditor_name: string | null
          enterprise_id: number
          final_inventory_account_id: number | null
          id: number
          initial_inventory_account_id: number | null
          inventory_account_id: number | null
          payroll_aguinaldo_bono14_provision_account_id: number | null
          payroll_aguinaldo_expense_account_id: number | null
          payroll_bonificacion_expense_account_id: number | null
          payroll_bono14_expense_account_id: number | null
          payroll_igss_patronal_expense_account_id: number | null
          payroll_igss_payable_account_id: number | null
          payroll_indemnizacion_expense_account_id: number | null
          payroll_indemnizacion_provision_account_id: number | null
          payroll_isr_payable_account_id: number | null
          payroll_salaries_expense_account_id: number | null
          payroll_salaries_payable_account_id: number | null
          payroll_vacaciones_expense_account_id: number | null
          period_result_account_id: number | null
          purchases_account_id: number | null
          realized_fx_gain_account_id: number | null
          realized_fx_loss_account_id: number | null
          retained_earnings_account_id: number | null
          sales_account_id: number | null
          suppliers_account_id: number | null
          unrealized_fx_gain_account_id: number | null
          unrealized_fx_loss_account_id: number | null
          vat_credit_account_id: number | null
          vat_debit_account_id: number | null
        }
        Insert: {
          cost_of_sales_account_id?: number | null
          cost_of_sales_method?: string | null
          created_at?: string | null
          customers_account_id?: number | null
          default_auditor_colegiado?: string | null
          default_auditor_name?: string | null
          enterprise_id: number
          final_inventory_account_id?: number | null
          id?: never
          initial_inventory_account_id?: number | null
          inventory_account_id?: number | null
          payroll_aguinaldo_bono14_provision_account_id?: number | null
          payroll_aguinaldo_expense_account_id?: number | null
          payroll_bonificacion_expense_account_id?: number | null
          payroll_bono14_expense_account_id?: number | null
          payroll_igss_patronal_expense_account_id?: number | null
          payroll_igss_payable_account_id?: number | null
          payroll_indemnizacion_expense_account_id?: number | null
          payroll_indemnizacion_provision_account_id?: number | null
          payroll_isr_payable_account_id?: number | null
          payroll_salaries_expense_account_id?: number | null
          payroll_salaries_payable_account_id?: number | null
          payroll_vacaciones_expense_account_id?: number | null
          period_result_account_id?: number | null
          purchases_account_id?: number | null
          realized_fx_gain_account_id?: number | null
          realized_fx_loss_account_id?: number | null
          retained_earnings_account_id?: number | null
          sales_account_id?: number | null
          suppliers_account_id?: number | null
          unrealized_fx_gain_account_id?: number | null
          unrealized_fx_loss_account_id?: number | null
          vat_credit_account_id?: number | null
          vat_debit_account_id?: number | null
        }
        Update: {
          cost_of_sales_account_id?: number | null
          cost_of_sales_method?: string | null
          created_at?: string | null
          customers_account_id?: number | null
          default_auditor_colegiado?: string | null
          default_auditor_name?: string | null
          enterprise_id?: number
          final_inventory_account_id?: number | null
          id?: never
          initial_inventory_account_id?: number | null
          inventory_account_id?: number | null
          payroll_aguinaldo_bono14_provision_account_id?: number | null
          payroll_aguinaldo_expense_account_id?: number | null
          payroll_bonificacion_expense_account_id?: number | null
          payroll_bono14_expense_account_id?: number | null
          payroll_igss_patronal_expense_account_id?: number | null
          payroll_igss_payable_account_id?: number | null
          payroll_indemnizacion_expense_account_id?: number | null
          payroll_indemnizacion_provision_account_id?: number | null
          payroll_isr_payable_account_id?: number | null
          payroll_salaries_expense_account_id?: number | null
          payroll_salaries_payable_account_id?: number | null
          payroll_vacaciones_expense_account_id?: number | null
          period_result_account_id?: number | null
          purchases_account_id?: number | null
          realized_fx_gain_account_id?: number | null
          realized_fx_loss_account_id?: number | null
          retained_earnings_account_id?: number | null
          sales_account_id?: number | null
          suppliers_account_id?: number | null
          unrealized_fx_gain_account_id?: number | null
          unrealized_fx_loss_account_id?: number | null
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
          {
            foreignKeyName: "tab_enterprise_config_retained_earnings_account_id_fkey"
            columns: ["retained_earnings_account_id"]
            isOneToOne: false
            referencedRelation: "tab_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_enterprise_currencies: {
        Row: {
          created_at: string
          created_by: string | null
          currency_code: string
          enterprise_id: number
          id: number
          is_active: boolean
          notes: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency_code: string
          enterprise_id: number
          id?: number
          is_active?: boolean
          notes?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency_code?: string
          enterprise_id?: number
          id?: number
          is_active?: boolean
          notes?: string | null
        }
        Relationships: []
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
          created_at: string
          created_by: string | null
          currency_code: string
          enterprise_id: number
          id: number
          month: number
          notes: string | null
          rate: number
          source: string | null
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency_code: string
          enterprise_id: number
          id?: number
          month: number
          notes?: string | null
          rate: number
          source?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency_code?: string
          enterprise_id?: number
          id?: number
          month?: number
          notes?: string | null
          rate?: number
          source?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      tab_exchange_rates_legacy: {
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
      tab_fx_open_balances: {
        Row: {
          created_at: string
          currency_code: string
          enterprise_id: number
          fully_settled: boolean
          id: number
          invoice_date: string
          invoice_id: number
          invoice_type: string
          original_open: number
          original_paid: number
          original_total: number
          registered_rate: number
          settled_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          enterprise_id: number
          fully_settled?: boolean
          id?: number
          invoice_date: string
          invoice_id: number
          invoice_type: string
          original_open: number
          original_paid?: number
          original_total: number
          registered_rate: number
          settled_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          enterprise_id?: number
          fully_settled?: boolean
          id?: number
          invoice_date?: string
          invoice_id?: number
          invoice_type?: string
          original_open?: number
          original_paid?: number
          original_total?: number
          registered_rate?: number
          settled_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_fx_open_balances_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_fx_revaluation_runs: {
        Row: {
          created_at: string
          created_by: string | null
          cutoff_date: string
          details_json: Json | null
          enterprise_id: number
          id: number
          journal_entry_id: number | null
          month: number
          notes: string | null
          revaluation_type: string
          reversed_at: string | null
          status: string
          total_gain: number
          total_loss: number
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cutoff_date: string
          details_json?: Json | null
          enterprise_id: number
          id?: number
          journal_entry_id?: number | null
          month: number
          notes?: string | null
          revaluation_type?: string
          reversed_at?: string | null
          status?: string
          total_gain?: number
          total_loss?: number
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cutoff_date?: string
          details_json?: Json | null
          enterprise_id?: number
          id?: number
          journal_entry_id?: number | null
          month?: number
          notes?: string | null
          revaluation_type?: string
          reversed_at?: string | null
          status?: string
          total_gain?: number
          total_loss?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_fx_revaluation_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_fx_settlements: {
        Row: {
          created_at: string
          created_by: string | null
          difc_journal_id: number | null
          enterprise_id: number
          fx_difference: number
          id: number
          is_gain: boolean
          notes: string | null
          open_balance_id: number
          paid_original_amount: number
          payment_date: string
          payment_journal_id: number
          payment_rate: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          difc_journal_id?: number | null
          enterprise_id: number
          fx_difference: number
          id?: number
          is_gain: boolean
          notes?: string | null
          open_balance_id: number
          paid_original_amount: number
          payment_date: string
          payment_journal_id: number
          payment_rate: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          difc_journal_id?: number | null
          enterprise_id?: number
          fx_difference?: number
          id?: number
          is_gain?: boolean
          notes?: string | null
          open_balance_id?: number
          paid_original_amount?: number
          payment_date?: string
          payment_journal_id?: number
          payment_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_fx_settlements_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_fx_settlements_open_balance_id_fkey"
            columns: ["open_balance_id"]
            isOneToOne: false
            referencedRelation: "tab_fx_open_balances"
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
      tab_integrity_rules_config: {
        Row: {
          created_at: string
          enterprise_id: number
          id: number
          is_enabled: boolean
          rule_code: string
          severity_override: string | null
        }
        Insert: {
          created_at?: string
          enterprise_id: number
          id?: number
          is_enabled?: boolean
          rule_code: string
          severity_override?: string | null
        }
        Update: {
          created_at?: string
          enterprise_id?: number
          id?: number
          is_enabled?: boolean
          rule_code?: string
          severity_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_integrity_rules_config_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_integrity_validations: {
        Row: {
          enterprise_id: number
          health_score: number
          id: number
          period_id: number | null
          results: Json
          run_at: string
          run_by: string
          total_errors: number
          total_info: number
          total_warnings: number
        }
        Insert: {
          enterprise_id: number
          health_score?: number
          id?: number
          period_id?: number | null
          results?: Json
          run_at?: string
          run_by: string
          total_errors?: number
          total_info?: number
          total_warnings?: number
        }
        Update: {
          enterprise_id?: number
          health_score?: number
          id?: number
          period_id?: number | null
          results?: Json
          run_at?: string
          run_by?: string
          total_errors?: number
          total_info?: number
          total_warnings?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_integrity_validations_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_integrity_validations_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "tab_accounting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_journal_entries: {
        Row: {
          accounting_period_id: number | null
          bank_account_id: number | null
          bank_direction: string | null
          bank_reference: string | null
          beneficiary_name: string | null
          created_at: string | null
          created_by: string | null
          currency_code: string | null
          currency_id: number | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          document_reference: string | null
          document_references: string[] | null
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
          reversal_entry_id: number | null
          reversed_by_entry_id: number | null
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
          bank_direction?: string | null
          bank_reference?: string | null
          beneficiary_name?: string | null
          created_at?: string | null
          created_by?: string | null
          currency_code?: string | null
          currency_id?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          document_reference?: string | null
          document_references?: string[] | null
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
          reversal_entry_id?: number | null
          reversed_by_entry_id?: number | null
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
          bank_direction?: string | null
          bank_reference?: string | null
          beneficiary_name?: string | null
          created_at?: string | null
          created_by?: string | null
          currency_code?: string | null
          currency_id?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          document_reference?: string | null
          document_references?: string[] | null
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
          reversal_entry_id?: number | null
          reversed_by_entry_id?: number | null
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
            foreignKeyName: "tab_journal_entries_reversal_entry_id_fkey"
            columns: ["reversal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_journal_entries_reversed_by_entry_id_fkey"
            columns: ["reversed_by_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
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
          currency_code: string | null
          debit_amount: number | null
          deleted_at: string | null
          description: string | null
          exchange_rate: number | null
          id: number
          is_bank_line: boolean
          journal_entry_id: number | null
          line_number: number
          original_credit: number | null
          original_debit: number | null
          source_id: number | null
          source_ref: string | null
          source_type: string | null
        }
        Insert: {
          account_id?: number | null
          bank_reference?: string | null
          cost_center?: string | null
          credit_amount?: number | null
          currency_code?: string | null
          debit_amount?: number | null
          deleted_at?: string | null
          description?: string | null
          exchange_rate?: number | null
          id?: number
          is_bank_line?: boolean
          journal_entry_id?: number | null
          line_number: number
          original_credit?: number | null
          original_debit?: number | null
          source_id?: number | null
          source_ref?: string | null
          source_type?: string | null
        }
        Update: {
          account_id?: number | null
          bank_reference?: string | null
          cost_center?: string | null
          credit_amount?: number | null
          currency_code?: string | null
          debit_amount?: number | null
          deleted_at?: string | null
          description?: string | null
          exchange_rate?: number | null
          id?: number
          is_bank_line?: boolean
          journal_entry_id?: number | null
          line_number?: number
          original_credit?: number | null
          original_debit?: number | null
          source_id?: number | null
          source_ref?: string | null
          source_type?: string | null
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
      tab_journal_entry_metadata_changes: {
        Row: {
          after_json: Json
          before_json: Json
          changed_at: string
          changed_by: string
          enterprise_id: number
          id: number
          journal_entry_id: number
          reason: string
        }
        Insert: {
          after_json: Json
          before_json: Json
          changed_at?: string
          changed_by: string
          enterprise_id: number
          id?: never
          journal_entry_id: number
          reason: string
        }
        Update: {
          after_json?: Json
          before_json?: Json
          changed_at?: string
          changed_by?: string
          enterprise_id?: number
          id?: never
          journal_entry_id?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_journal_entry_metadata_changes_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_journal_entry_metadata_changes_journal_entry_id_fkey"
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
      tab_legacy_import_jobs: {
        Row: {
          created_at: string
          created_by: string
          current_count: number
          current_step: string | null
          enterprise_id: number
          error_message: string | null
          errors: Json
          finished_at: string | null
          id: string
          payload: Json
          result: Json | null
          started_at: string | null
          status: string
          steps_completed: Json
          tenant_id: number
          total_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_count?: number
          current_step?: string | null
          enterprise_id: number
          error_message?: string | null
          errors?: Json
          finished_at?: string | null
          id?: string
          payload: Json
          result?: Json | null
          started_at?: string | null
          status?: string
          steps_completed?: Json
          tenant_id: number
          total_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_count?: number
          current_step?: string | null
          enterprise_id?: number
          error_message?: string | null
          errors?: Json
          finished_at?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          started_at?: string | null
          status?: string
          steps_completed?: Json
          tenant_id?: number
          total_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_legacy_import_jobs_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
        ]
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
      tab_payroll_entries: {
        Row: {
          base_salary: number
          bonificacion_decreto: number
          commissions: number
          created_at: string
          employee_dpi: string | null
          employee_name: string
          employee_position: string | null
          enterprise_id: number
          id: number
          igss_laboral: number
          isr_retained: number
          loans_deduction: number
          net_pay: number
          other_deductions: number
          other_income: number
          overtime: number
          payroll_period_id: number
        }
        Insert: {
          base_salary?: number
          bonificacion_decreto?: number
          commissions?: number
          created_at?: string
          employee_dpi?: string | null
          employee_name: string
          employee_position?: string | null
          enterprise_id: number
          id?: number
          igss_laboral?: number
          isr_retained?: number
          loans_deduction?: number
          net_pay?: number
          other_deductions?: number
          other_income?: number
          overtime?: number
          payroll_period_id: number
        }
        Update: {
          base_salary?: number
          bonificacion_decreto?: number
          commissions?: number
          created_at?: string
          employee_dpi?: string | null
          employee_name?: string
          employee_position?: string | null
          enterprise_id?: number
          id?: number
          igss_laboral?: number
          isr_retained?: number
          loans_deduction?: number
          net_pay?: number
          other_deductions?: number
          other_income?: number
          overtime?: number
          payroll_period_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_payroll_entries_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "tab_payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_payroll_periods: {
        Row: {
          created_at: string
          created_by: string | null
          enterprise_id: number
          id: number
          journal_entry_id: number | null
          notes: string | null
          payment_date: string
          period_month: number
          period_year: number
          status: string
          total_deductions: number
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enterprise_id: number
          id?: number
          journal_entry_id?: number | null
          notes?: string | null
          payment_date: string
          period_month: number
          period_year: number
          status?: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enterprise_id?: number
          id?: number
          journal_entry_id?: number | null
          notes?: string | null
          payment_date?: string
          period_month?: number
          period_year?: number
          status?: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: []
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
      tab_purchase_journal_links: {
        Row: {
          enterprise_id: number
          id: number
          journal_entry_id: number
          link_source: string
          linked_at: string
          linked_by: string
          purchase_id: number
        }
        Insert: {
          enterprise_id: number
          id?: never
          journal_entry_id: number
          link_source?: string
          linked_at?: string
          linked_by?: string
          purchase_id: number
        }
        Update: {
          enterprise_id?: number
          id?: never
          journal_entry_id?: number
          link_source?: string
          linked_at?: string
          linked_by?: string
          purchase_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_purchase_journal_links_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "tab_enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_purchase_journal_links_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "tab_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_purchase_journal_links_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "tab_purchase_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_purchase_ledger: {
        Row: {
          accounting_period_id: number | null
          bank_account_id: number | null
          base_amount: number | null
          batch_reference: string | null
          created_at: string | null
          currency_code: string | null
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
          original_subtotal: number | null
          original_total: number | null
          original_vat: number | null
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
          currency_code?: string | null
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
          original_subtotal?: number | null
          original_total?: number | null
          original_vat?: number | null
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
          currency_code?: string | null
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
          original_subtotal?: number | null
          original_total?: number | null
          original_vat?: number | null
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
          currency_code: string | null
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
          original_subtotal: number | null
          original_total: number | null
          original_vat: number | null
          total_amount: number
          vat_amount: number
        }
        Insert: {
          accounting_period_id?: number | null
          authorization_number: string
          created_at?: string | null
          currency_code?: string | null
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
          original_subtotal?: number | null
          original_total?: number | null
          original_vat?: number | null
          total_amount: number
          vat_amount: number
        }
        Update: {
          accounting_period_id?: number | null
          authorization_number?: string
          created_at?: string | null
          currency_code?: string | null
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
          original_subtotal?: number | null
          original_total?: number | null
          original_vat?: number | null
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
      tab_training_progress: {
        Row: {
          completed_at: string
          id: number
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: number
          lesson_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: number
          lesson_id?: string
          user_id?: string
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
      taxpayer_cache: {
        Row: {
          last_checked: string
          name: string
          nit: string
          source: string
        }
        Insert: {
          last_checked?: string
          name: string
          nit: string
          source?: string
        }
        Update: {
          last_checked?: string
          name?: string
          nit?: string
          source?: string
        }
        Relationships: []
      }
      ticket_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_url: string
          id: number
          ticket_message_id: number
        }
        Insert: {
          created_at?: string
          file_name: string
          file_url: string
          id?: never
          ticket_message_id: number
        }
        Update: {
          created_at?: string
          file_name?: string
          file_url?: string
          id?: never
          ticket_message_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_message_id_fkey"
            columns: ["ticket_message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          created_at: string
          id: number
          is_internal: boolean
          message: string
          sender_user_id: string
          ticket_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          is_internal?: boolean
          message: string
          sender_user_id: string
          ticket_id: number
        }
        Update: {
          created_at?: string
          id?: never
          is_internal?: boolean
          message?: string
          sender_user_id?: string
          ticket_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to_user_id: string | null
          category: Database["public"]["Enums"]["ticket_category"]
          created_at: string
          created_by_user_id: string
          id: number
          priority: Database["public"]["Enums"]["ticket_priority"]
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          created_by_user_id: string
          id?: never
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          created_by_user_id?: string
          id?: never
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_tenant_id_fkey"
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
      v_rls_coverage: {
        Row: {
          commands_covered: string[] | null
          compliance_gap: string | null
          has_all_policy: boolean | null
          is_reference_table: boolean | null
          is_rls_compliant: boolean | null
          is_write_protected: boolean | null
          policy_count: number | null
          rls_enabled: boolean | null
          tablename: unknown
          write_protected_reason: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      allocate_journal_entry_number: {
        Args: {
          p_enterprise_id: number
          p_entry_date: string
          p_entry_type: string
        }
        Returns: string
      }
      assert_tenant_context: { Args: never; Returns: undefined }
      calculate_fx_settlement: {
        Args: {
          p_open_balance_id: number
          p_paid_original: number
          p_payment_date: string
          p_payment_rate: number
        }
        Returns: {
          currency_code: string
          fully_settled: boolean
          fx_difference: number
          invoice_id: number
          invoice_type: string
          is_gain: boolean
          open_balance_id: number
          paid_original: number
          payment_rate: number
          registered_rate: number
          remaining_open: number
        }[]
      }
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
      current_enterprise_id: { Args: never; Returns: number }
      current_tenant_id: { Args: never; Returns: number }
      fail_if_rls_gap: {
        Args: never
        Returns: {
          compliance_gap: string
          policy_count: number
          rls_enabled: boolean
          tablename: string
        }[]
      }
      generate_asset_depreciation_schedule: {
        Args: { p_asset_id: number }
        Returns: undefined
      }
      get_account_balances_by_period: {
        Args: { p_end_date: string; p_enterprise_id: number }
        Returns: {
          account_code: string
          account_id: number
          account_name: string
          account_type: string
          balance: number
          balance_type: string
          total_credit: number
          total_debit: number
        }[]
      }
      get_account_fx_balance: {
        Args: {
          _account_id: number
          _currency_code: string
          _cutoff_date: string
        }
        Returns: number
      }
      get_account_ledger_as_of: {
        Args: {
          p_account_id: number
          p_as_of_date: string
          p_enterprise_id: number
          p_include_drafts?: boolean
          p_limit?: number
          p_offset?: number
          p_year: number
        }
        Returns: {
          credit_amount: number
          debit_amount: number
          detail_id: number
          entry_date: string
          entry_description: string
          entry_number: string
          entry_status: string
          line_description: string
          opening_balance_year: number
          running_balance: number
          total_rows: number
        }[]
      }
      get_asset_depreciation_summary: {
        Args: { p_as_of_date?: string; p_enterprise_id: number }
        Returns: {
          accumulated_depreciation: number
          acquisition_cost: number
          acquisition_date: string
          asset_code: string
          asset_id: number
          asset_name: string
          category_name: string
          in_service_date: string
          net_book_value: number
          residual_value: number
          status: string
          useful_life_months: number
        }[]
      }
      get_authorization_folio_status: {
        Args: { _authorization_id: number }
        Returns: {
          adjustment: number
          authorized: number
          available: number
          is_low: boolean
          is_overdrawn: boolean
          used: number
        }[]
      }
      get_balance_sheet: {
        Args: { p_as_of_date: string; p_enterprise_id: number }
        Returns: {
          account_code: string
          account_id: number
          account_name: string
          account_type: string
          balance: number
          balance_type: string
          level: number
          parent_account_id: number
          total_credit: number
          total_debit: number
        }[]
      }
      get_batch_purchase_mappings: {
        Args: { p_enterprise_id: number; p_supplier_nits: string[] }
        Returns: {
          expense_account_id: number
          operation_type_id: number
          source_date: string
          supplier_nit: string
        }[]
      }
      get_enterprise_functional_currency: {
        Args: { _enterprise_id: number }
        Returns: string
      }
      get_enterprise_tenant_id: {
        Args: { _enterprise_id: number }
        Returns: number
      }
      get_exchange_rate: {
        Args: { _currency_code: string; _date: string; _enterprise_id: number }
        Returns: number
      }
      get_last_purchase_mapping: {
        Args: { p_enterprise_id: number; p_supplier_nit: string }
        Returns: {
          expense_account_id: number
          operation_type_id: number
          source_date: string
          source_invoice_id: number
        }[]
      }
      get_ledger_detail: {
        Args: {
          p_account_ids: number[]
          p_end_date: string
          p_enterprise_id: number
          p_start_date: string
        }
        Returns: {
          account_id: number
          credit_amount: number
          currency_code: string
          debit_amount: number
          detail_id: number
          entry_date: string
          entry_description: string
          entry_number: string
          exchange_rate: number
          journal_entry_id: number
          line_description: string
          opening_balance: number
          original_credit: number
          original_debit: number
        }[]
      }
      get_monthly_ledger_summary: {
        Args: { p_enterprise_id: number; p_ledger: string; p_year: number }
        Returns: {
          base_amount: number
          month_num: number
          record_count: number
          total: number
          vat_amount: number
        }[]
      }
      get_period_profit: {
        Args: {
          p_end_date: string
          p_enterprise_id: number
          p_start_date: string
        }
        Returns: number
      }
      get_pnl: {
        Args: {
          p_end_date: string
          p_enterprise_id: number
          p_start_date: string
        }
        Returns: {
          account_code: string
          account_id: number
          account_name: string
          account_type: string
          balance: number
          level: number
          parent_account_id: number
          period_credit: number
          period_debit: number
        }[]
      }
      get_trial_balance: {
        Args: {
          p_end_date: string
          p_enterprise_id: number
          p_start_date: string
        }
        Returns: {
          account_code: string
          account_id: number
          account_name: string
          account_type: string
          balance_type: string
          closing_balance: number
          closing_credit: number
          closing_debit: number
          level: number
          opening_balance: number
          opening_credit: number
          opening_debit: number
          parent_account_id: number
          period_credit: number
          period_debit: number
        }[]
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
      has_role_permission: {
        Args: {
          _enterprise_id: number
          _permission_key: string
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
      is_support_agent: { Args: { p_user_id: string }; Returns: boolean }
      is_tenant_active: { Args: { tenant_id_param: number }; Returns: boolean }
      is_tenant_admin_for: {
        Args: { check_tenant_id: number; user_uuid: string }
        Returns: boolean
      }
      is_tenant_admin_for_bypass: {
        Args: { check_tenant_id: number; user_uuid: string }
        Returns: boolean
      }
      preview_next_entry_number: {
        Args: {
          p_enterprise_id: number
          p_entry_date: string
          p_entry_type: string
        }
        Returns: string
      }
      register_fx_settlement: {
        Args: {
          p_difc_journal_id: number
          p_fx_difference: number
          p_notes?: string
          p_open_balance_id: number
          p_paid_original: number
          p_payment_date: string
          p_payment_journal_id: number
          p_payment_rate: number
        }
        Returns: number
      }
      reverse_fx_revaluation: { Args: { p_run_id: number }; Returns: number }
      update_posted_entry_metadata: {
        Args: {
          p_bank_reference?: string
          p_beneficiary_name?: string
          p_description?: string
          p_document_reference?: string
          p_journal_entry_id: number
          p_reason?: string
        }
        Returns: Json
      }
      user_is_linked_to_enterprise: {
        Args: { _enterprise_id: number; _user_id: string }
        Returns: boolean
      }
      validate_invoice_date: {
        Args: { book_month: number; book_year: number; invoice_date: string }
        Returns: boolean
      }
      verify_audit_chain: {
        Args: { p_enterprise_id: number; p_entity_type?: string }
        Returns: {
          action: string
          chain_valid: boolean
          created_at: string
          entity_id: number
          entity_type: string
          id: number
          prev_row_hash: string
          row_hash: string
        }[]
      }
      write_audit_event: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_after_json?: Json
          p_before_json?: Json
          p_enterprise_id: number
          p_entity_id: number
          p_entity_type: string
          p_metadata_json?: Json
          p_request_id?: string
          p_tenant_id: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "enterprise_admin"
        | "contador_senior"
        | "auxiliar_contable"
        | "cliente"
      ticket_category: "technical" | "accounting" | "billing" | "other"
      ticket_priority: "low" | "medium" | "high"
      ticket_status:
        | "open"
        | "in_progress"
        | "waiting_user"
        | "resolved"
        | "closed"
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
        "contador_senior",
        "auxiliar_contable",
        "cliente",
      ],
      ticket_category: ["technical", "accounting", "billing", "other"],
      ticket_priority: ["low", "medium", "high"],
      ticket_status: [
        "open",
        "in_progress",
        "waiting_user",
        "resolved",
        "closed",
      ],
    },
  },
} as const
