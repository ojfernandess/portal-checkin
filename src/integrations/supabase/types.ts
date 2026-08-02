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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      establishments: {
        Row: {
          establishment_id: string
          name: string
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          establishment_id: string
          name: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          establishment_id?: string
          name?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      establishment_terms: {
        Row: {
          establishment_id: string
          establishment_name: string | null
          content: Json
          version: number
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          establishment_id: string
          establishment_name?: string | null
          content?: Json
          version?: number
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          establishment_id?: string
          establishment_name?: string | null
          content?: Json
          version?: number
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      establishment_terms_history: {
        Row: {
          id: string
          establishment_id: string
          content: Json
          version: number
          edited_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          content: Json
          version: number
          edited_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          establishment_id?: string
          content?: Json
          version?: number
          edited_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      establishment_contacts: {
        Row: {
          establishment_id: string
          establishment_name: string | null
          phone: string | null
          whatsapp: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          establishment_id: string
          establishment_name?: string | null
          phone?: string | null
          whatsapp?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          establishment_id?: string
          establishment_name?: string | null
          phone?: string | null
          whatsapp?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      establishment_settings: {
        Row: {
          establishment_id: string
          settings: Json
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          establishment_id: string
          settings?: Json
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          establishment_id?: string
          settings?: Json
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      establishment_extra_fields: {
        Row: {
          id: string
          establishment_id: string
          label: string
          field_type: string
          required: boolean
          options: Json | null
          step: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          label: string
          field_type: string
          required?: boolean
          options?: Json | null
          step?: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          establishment_id?: string
          label?: string
          field_type?: string
          required?: boolean
          options?: Json | null
          step?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      staff_establishments: {
        Row: {
          id: string
          user_id: string
          establishment_id: string
        }
        Insert: {
          id?: string
          user_id: string
          establishment_id: string
        }
        Update: {
          id?: string
          user_id?: string
          establishment_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string | null
          user_email: string | null
          action: string
          entity_type: string
          entity_id: string | null
          old_data: Json | null
          new_data: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          user_email?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          user_email?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      checkin_records: {
        Row: {
          id: string
          localizer: string
          reservation_id: string | null
          establishment_id: string | null
          establishment_name: string | null
          guest_name: string
          guest_email: string | null
          guest_document: string | null
          guest_document_type: string | null
          guest_phone: string | null
          main_guest: Json
          dependents: Json
          embratur: Json | null
          reservation_snapshot: Json | null
          extra_fields: Json | null
          terms_accepted: boolean
          terms_accepted_at: string | null
          terms_version: number | null
          checked_in_at: string
          created_at: string
        }
        Insert: {
          id?: string
          localizer: string
          reservation_id?: string | null
          establishment_id?: string | null
          establishment_name?: string | null
          guest_name: string
          guest_email?: string | null
          guest_document?: string | null
          guest_document_type?: string | null
          guest_phone?: string | null
          main_guest?: Json
          dependents?: Json
          embratur?: Json | null
          reservation_snapshot?: Json | null
          extra_fields?: Json | null
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          terms_version?: number | null
          checked_in_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          localizer?: string
          reservation_id?: string | null
          establishment_id?: string | null
          establishment_name?: string | null
          guest_name?: string
          guest_email?: string | null
          guest_document?: string | null
          guest_document_type?: string | null
          guest_phone?: string | null
          main_guest?: Json
          dependents?: Json
          embratur?: Json | null
          reservation_snapshot?: Json | null
          extra_fields?: Json | null
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          terms_version?: number | null
          checked_in_at?: string
          created_at?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          window_start?: string
        }
        Update: {
          bucket_key?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "reception"
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
      app_role: ["admin", "reception"],
    },
  },
} as const
