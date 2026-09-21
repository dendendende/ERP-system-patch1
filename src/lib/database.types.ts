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
          name: string
          notes: string
          whatsapp_number: string | null
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string
          whatsapp_number?: string | null
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string
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
            referencedRelation: "customers"
            referencedColumns: ["id"]
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
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          id: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id: string
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_rules_to_unlabelled: { Args: never; Returns: number }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      enable_audit: { Args: { target: unknown }; Returns: undefined }
      jakarta_today: { Args: never; Returns: string }
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
      suggest_categories: {
        Args: { p_description: string; p_direction: string }
        Returns: {
          category_id: string
          name: string
          score: number
        }[]
      }
      sync_bank_batch: {
        Args: { p_account_id: string; p_rows: Json; p_synced_at: string }
        Returns: number
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

