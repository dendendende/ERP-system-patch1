export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      balance_checks: {
        Row: {
          actual: number | null
          bank_account_id: string
          checked_on: string
          created_at: string
          difference: number | null
          expected: number | null
          id: string
          likely_cause: string | null
          status: string
        }
        Insert: {
          actual?: number | null
          bank_account_id: string
          checked_on: string
          created_at?: string
          difference?: number | null
          expected?: number | null
          id?: string
          likely_cause?: string | null
          status: string
        }
        Update: {
          actual?: number | null
          bank_account_id?: string
          checked_on?: string
          created_at?: string
          difference?: number | null
          expected?: number | null
          id?: string
          likely_cause?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_checks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_last4: string
          account_name: string
          bank_name: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          source: string
        }
        Insert: {
          account_last4: string
          account_name: string
          bank_name: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          source: string
        }
        Update: {
          account_last4?: string
          account_name?: string
          bank_name?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          source?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          created_at: string
          description_raw: string
          direction: string
          external_id: string
          id: string
          occurred_at: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          bank_account_id: string
          created_at?: string
          description_raw?: string
          direction: string
          external_id: string
          id?: string
          occurred_at: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          bank_account_id?: string
          created_at?: string
          description_raw?: string
          direction?: string
          external_id?: string
          id?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          id: string
          is_system: boolean
          name: string
          report_group: string
          type: string
        }
        Insert: {
          id?: string
          is_system?: boolean
          name: string
          report_group: string
          type: string
        }
        Update: {
          id?: string
          is_system?: boolean
          name?: string
          report_group?: string
          type?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          billing_email: string | null
          created_at: string
          id: string
          is_active: boolean
          language: string
          name: string
          notes: string
          reminders_paused: boolean
          whatsapp_number: string | null
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          language?: string
          name: string
          notes?: string
          reminders_paused?: boolean
          whatsapp_number?: string | null
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          language?: string
          name?: string
          notes?: string
          reminders_paused?: boolean
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      entries: {
        Row: {
          bank_transaction_id: string
          category_id: string | null
          customer_id: string | null
          id: string
          invoice_id: string | null
          is_recurring: boolean
          note: string
          rule_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bank_transaction_id: string
          category_id?: string | null
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          is_recurring?: boolean
          note?: string
          rule_id?: string | null
          status: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bank_transaction_id?: string
          category_id?: string | null
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          is_recurring?: boolean
          note?: string
          rule_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: true
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: true
            referencedRelation: "money_moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "reminders_to_send"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "renewal_pipeline"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "team_escalations"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "team_escalations"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "entries_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
        ]
      }
      health_snapshots: {
        Row: {
          explanation: string
          signal: string
          status: string
          taken_on: string
          value: number | null
        }
        Insert: {
          explanation: string
          signal: string
          status: string
          taken_on: string
          value?: number | null
        }
        Update: {
          explanation?: string
          signal?: string
          status?: string
          taken_on?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "health_snapshots_signal_fkey"
            columns: ["signal"]
            isOneToOne: false
            referencedRelation: "health_thresholds"
            referencedColumns: ["signal"]
          },
        ]
      }
      health_thresholds: {
        Row: {
          direction: string
          healthy_limit: number
          signal: string
          warning_limit: number | null
        }
        Insert: {
          direction: string
          healthy_limit: number
          signal: string
          warning_limit?: number | null
        }
        Update: {
          direction?: string
          healthy_limit?: number
          signal?: string
          warning_limit?: number | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_due: number
          base_amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          due_on: string
          id: string
          issued_on: string
          notes: string
          number: string
          reminders_paused: boolean
          status: string
          subscription_id: string | null
          transfer_amount: number | null
          unique_amount: number | null
          unique_code: number
          void_reason: string | null
        }
        Insert: {
          amount_due: number
          base_amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          due_on: string
          id?: string
          issued_on: string
          notes?: string
          number: string
          reminders_paused?: boolean
          status?: string
          subscription_id?: string | null
          transfer_amount?: number | null
          unique_amount?: number | null
          unique_code: number
          void_reason?: string | null
        }
        Update: {
          amount_due?: number
          base_amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          due_on?: string
          id?: string
          issued_on?: string
          notes?: string
          number?: string
          reminders_paused?: boolean
          status?: string
          subscription_id?: string | null
          transfer_amount?: number | null
          unique_amount?: number | null
          unique_code?: number
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "reminders_to_send"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "renewal_pipeline"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "team_escalations"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "renewal_pipeline"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_applied: number
          bank_transaction_id: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          method: string
          reason: string | null
        }
        Insert: {
          amount_applied: number
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          method: string
          reason?: string | null
        }
        Update: {
          amount_applied?: number
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          method?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "money_moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "team_escalations"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          failures: number
          key: string
          window_start: string
        }
        Insert: {
          failures: number
          key: string
          window_start: string
        }
        Update: {
          failures?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          day_of_month: number
          end_date: string | null
          expected_amount: number
          frequency: string
          id: string
          is_active: boolean
          name: string
          source_pattern: string | null
          start_date: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month: number
          end_date?: string | null
          expected_amount: number
          frequency: string
          id?: string
          is_active?: boolean
          name: string
          source_pattern?: string | null
          start_date: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number
          end_date?: string | null
          expected_amount?: number
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          source_pattern?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_suggestion_dismissals: {
        Row: {
          dismissed_at: string
          dismissed_by: string | null
          pattern: string
        }
        Insert: {
          dismissed_at?: string
          dismissed_by?: string | null
          pattern: string
        }
        Update: {
          dismissed_at?: string
          dismissed_by?: string | null
          pattern?: string
        }
        Relationships: []
      }
      reminder_schedule: {
        Row: {
          channels: string[]
          created_at: string
          id: string
          is_active: boolean
          kind: string
          offset_days: number
          template_key: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          kind: string
          offset_days: number
          template_key: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          offset_days?: number
          template_key?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          amount_shown: number | null
          channel: string
          claimed_at: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          invoice_id: string
          provider_message_id: string | null
          schedule_id: string | null
          scheduled_for: string
          sent_at: string | null
          sent_by: string | null
          status: string
          template_key: string | null
        }
        Insert: {
          amount_shown?: number | null
          channel: string
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          invoice_id: string
          provider_message_id?: string | null
          schedule_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          template_key?: string | null
        }
        Update: {
          amount_shown?: number | null
          channel?: string
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          invoice_id?: string
          provider_message_id?: string | null
          schedule_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          template_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "team_escalations"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "reminders_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "reminder_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          category_id: string
          created_at: string
          created_from_entry_id: string | null
          direction: string
          id: string
          is_active: boolean
          is_recurring: boolean
          match_field: string
          match_type: string
          pattern: string
          priority: number
        }
        Insert: {
          category_id: string
          created_at?: string
          created_from_entry_id?: string | null
          direction: string
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          match_field?: string
          match_type: string
          pattern: string
          priority?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          created_from_entry_id?: string | null
          direction?: string
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          match_field?: string
          match_type?: string
          pattern?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "rules_category_id_direction_fkey"
            columns: ["category_id", "direction"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "type"]
          },
          {
            foreignKeyName: "rules_created_from_entry_id_fkey"
            columns: ["created_from_entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      sign_in_devices: {
        Row: {
          device_id: string
          first_seen: string
          id: number
          ip: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_id: string
          first_seen?: string
          id?: never
          ip?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_id?: string
          first_seen?: string
          id?: never
          ip?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sign_in_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          customer_id: string
          cycle: string
          end_date: string | null
          id: string
          next_invoice_date: string
          plan_name: string
          price: number
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          cycle: string
          end_date?: string | null
          id?: string
          next_invoice_date: string
          plan_name: string
          price: number
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          cycle?: string
          end_date?: string | null
          id?: string
          next_invoice_date?: string
          plan_name?: string
          price?: number
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "reminders_to_send"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "renewal_pipeline"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "team_escalations"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id: string
          is_active?: boolean
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
    }
    Views: {
      customer_billing: {
        Row: {
          id: string | null
          is_active: boolean | null
          is_late: boolean | null
          is_ongoing: boolean | null
          is_renewing_soon: boolean | null
          name: string | null
          next_due: string | null
          renews_on: string | null
          still_owed: number | null
        }
        Relationships: []
      }
      customer_payment_delay: {
        Row: {
          avg_delay_days: number | null
          customer_id: string | null
          paid_bills: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "reminders_to_send"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "renewal_pipeline"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "team_escalations"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      money_moves: {
        Row: {
          amount: number | null
          day: string | null
          direction: string | null
          id: string | null
          is_recurring: boolean | null
        }
        Relationships: []
      }
      payments_without_transfer: {
        Row: {
          amount_applied: number | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          id: string | null
          invoice_id: string | null
          number: string | null
          reason: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "reminders_to_send"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "renewal_pipeline"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "team_escalations"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "team_escalations"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      reminders_to_send: {
        Row: {
          amount_due: number | null
          amount_to_transfer: number | null
          customer_id: string | null
          customer_name: string | null
          due_on: string | null
          email: string | null
          invoice_id: string | null
          issued_on: string | null
          kind: string | null
          language: string | null
          number: string | null
          offset_days: number | null
          phone: string | null
          reminder_id: string | null
          scheduled_for: string | null
          still_owed: number | null
          template_key: string | null
          waiting_for_bank: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "team_escalations"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      renewal_pipeline: {
        Row: {
          customer_id: string | null
          customer_name: string | null
          days_until: number | null
          open_invoice_id: string | null
          paid_late_last_cycle: boolean | null
          partial_payments: boolean | null
          plan_name: string | null
          price: number | null
          recently_paused: boolean | null
          reminders_waiting: boolean | null
          renews_on: string | null
          subscription_id: string | null
        }
        Relationships: []
      }
      team_escalations: {
        Row: {
          customer_id: string | null
          customer_name: string | null
          days_late: number | null
          due_on: string | null
          email: string | null
          invoice_id: string | null
          number: string | null
          phone: string | null
          still_owed: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_payment: {
        Args: {
          p_amount: number
          p_bank_transaction_id: string
          p_invoice_id: string
          p_method?: string
        }
        Returns: {
          amount_applied: number
          bank_transaction_id: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          method: string
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_rules_to_unlabelled: { Args: never; Returns: number }
      bank_seen_since: { Args: { p_moment: string }; Returns: boolean }
      came_in_went_out: {
        Args: { p_from: string; p_to: string }
        Returns: {
          came_in: number
          went_out: number
        }[]
      }
      check_balances: {
        Args: { p_on?: string }
        Returns: {
          actual: number | null
          bank_account_id: string
          checked_on: string
          created_at: string
          difference: number | null
          expected: number | null
          id: string
          likely_cause: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "balance_checks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_due_reminders: {
        Args: { p_limit?: number }
        Returns: {
          amount_to_transfer: string
          channel: string
          id: string
          invoice_id: string
          kind: string
          scheduled_for: string
          still_owed: string
          template_key: string
        }[]
      }
      close_reminder: {
        Args: { p_reminder_id: string; p_sent: boolean }
        Returns: undefined
      }
      create_due_invoices: { Args: { p_lead_days?: number }; Returns: number }
      create_invoice: {
        Args: {
          p_base_amount: number
          p_customer_id: string
          p_due_on: string
          p_issued_on: string
          p_notes?: string
          p_subscription_id?: string
        }
        Returns: {
          amount_due: number
          base_amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          due_on: string
          id: string
          issued_on: string
          notes: string
          number: string
          reminders_paused: boolean
          status: string
          subscription_id: string | null
          transfer_amount: number | null
          unique_amount: number | null
          unique_code: number
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      customer_contacts: {
        Args: never
        Returns: {
          billing_email: string
          customer_id: string
          whatsapp_number: string
        }[]
      }
      enable_audit: { Args: { target: unknown }; Returns: undefined }
      fail_stale_reminder_claims: { Args: never; Returns: number }
      free_unique_code: { Args: { p_base: number }; Returns: number }
      health_status: {
        Args: { p_signal: string; p_value: number }
        Returns: string
      }
      invoice_candidates: {
        Args: { p_bank_transaction_id: string }
        Returns: {
          invoice_id: string
          strong: boolean
        }[]
      }
      invoice_number: { Args: { n: number }; Returns: string }
      invoice_paid: { Args: { p_invoice_id: string }; Returns: number }
      jakarta_today: { Args: never; Returns: string }
      lock_unique_amounts: { Args: never; Returns: undefined }
      mark_invoice_paid: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: {
          amount_applied: number
          bank_transaction_id: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          method: string
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_payments: { Args: never; Returns: number }
      match_rule: {
        Args: { p_description: string; p_direction: string }
        Returns: {
          category_id: string
          created_at: string
          created_from_entry_id: string | null
          direction: string
          id: string
          is_active: boolean
          is_recurring: boolean
          match_field: string
          match_type: string
          pattern: string
          priority: number
        }
        SetofOptions: {
          from: "*"
          to: "rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      money_summary: {
        Args: { p_today?: string }
        Returns: {
          accounts_without_balance: number
          came_in: number
          cash_in_bank: number
          past_due: number
          recurring_spending: number
          still_owed: number
          usual_came_in: number
          usual_went_out: number
          went_out: number
        }[]
      }
      monthly_in_out: {
        Args: { p_months?: number; p_today?: string }
        Returns: {
          came_in: number
          month: string
          went_out: number
        }[]
      }
      needs_label_inbox: {
        Args: { p_limit?: number }
        Returns: {
          account: string
          amount: string
          description: string
          direction: string
          entry_id: string
          occurred_at: string
          suggestions: Json
        }[]
      }
      payee_pattern: { Args: { p_description: string }; Returns: string }
      record_failure: {
        Args: { p_key: string; p_window_seconds: number }
        Returns: undefined
      }
      record_reminder_result: {
        Args: {
          p_amount_shown?: number
          p_error?: string
          p_id: string
          p_provider_message_id?: string
          p_sent: boolean
        }
        Returns: boolean
      }
      refresh_invoice: { Args: { p_invoice_id: string }; Returns: undefined }
      reminder_time: {
        Args: { p_due_on: string; p_offset_days: number }
        Returns: string
      }
      schedule_reminders: { Args: { p_invoice_id: string }; Returns: number }
      send_reminder_now: { Args: { p_invoice_id: string }; Returns: string }
      set_reminders_paused: {
        Args: { p_customer_id: string; p_paused: boolean; p_reason: string }
        Returns: undefined
      }
      suggest_categories: {
        Args: { p_description: string; p_direction: string }
        Returns: {
          category_id: string
          name: string
          score: number
        }[]
      }
      suggest_recurring_expenses: {
        Args: { p_today?: string }
        Returns: {
          category_id: string
          day_of_month: number
          expected_amount: number
          last_seen: string
          months_seen: number
          name: string
          pattern: string
        }[]
      }
      sync_bank_batch: {
        Args: { p_account_id: string; p_rows: Json; p_synced_at: string }
        Returns: number
      }
      take_health_snapshot: {
        Args: { p_on?: string }
        Returns: {
          explanation: string
          signal: string
          status: string
          taken_on: string
          value: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "health_snapshots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      too_many_failures: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      transaction_unapplied: {
        Args: { p_bank_transaction_id: string }
        Returns: number
      }
      void_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: {
          amount_due: number
          base_amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          due_on: string
          id: string
          issued_on: string
          notes: string
          number: string
          reminders_paused: boolean
          status: string
          subscription_id: string | null
          transfer_amount: number | null
          unique_amount: number | null
          unique_code: number
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "owner" | "operator" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["owner", "operator", "viewer"],
    },
  },
} as const

