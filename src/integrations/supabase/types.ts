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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      allies: {
        Row: {
          created_at: string
          id: string
          logo: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          logo?: string | null
          name?: string
        }
        Relationships: []
      }
      ally_contacts: {
        Row: {
          ally_id: string
          created_at: string
          email: string
          id: string
          is_primary: boolean
          name: string
          notes: string
          phone: string
          position: string
        }
        Insert: {
          ally_id: string
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          name: string
          notes?: string
          phone?: string
          position?: string
        }
        Update: {
          ally_id?: string
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string
          phone?: string
          position?: string
        }
        Relationships: [
          {
            foreignKeyName: "ally_contacts_ally_id_fkey"
            columns: ["ally_id"]
            isOneToOne: false
            referencedRelation: "allies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          category: string
          city: string
          created_at: string
          description: string
          economic_activity: string
          exports_usd: number
          id: string
          legal_name: string
          logo: string | null
          nit: string
          sales_by_year: Json
          trade_name: string
          updated_at: string
          vertical: string
          website: string
        }
        Insert: {
          category?: string
          city?: string
          created_at?: string
          description?: string
          economic_activity?: string
          exports_usd?: number
          id?: string
          legal_name?: string
          logo?: string | null
          nit?: string
          sales_by_year?: Json
          trade_name: string
          updated_at?: string
          vertical?: string
          website?: string
        }
        Update: {
          category?: string
          city?: string
          created_at?: string
          description?: string
          economic_activity?: string
          exports_usd?: number
          id?: string
          legal_name?: string
          logo?: string | null
          nit?: string
          sales_by_year?: Json
          trade_name?: string
          updated_at?: string
          vertical?: string
          website?: string
        }
        Relationships: []
      }
      company_actions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          date: string
          description: string
          id: string
          notes: string | null
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          notes?: string | null
          type?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          notes?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_embeddings: {
        Row: {
          company_id: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_embeddings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_fit_logs: {
        Row: {
          company_id: string | null
          company_name: string
          created_at: string
          created_by: string | null
          duration_ms: number | null
          error: string | null
          id: string
          model: string
          reasoning_effort: string
          request_payload: Json
          response_payload: Json | null
          rues_attempts: string[]
          rues_data: Json | null
          rues_found: boolean
        }
        Insert: {
          company_id?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          model?: string
          reasoning_effort?: string
          request_payload?: Json
          response_payload?: Json | null
          rues_attempts?: string[]
          rues_data?: Json | null
          rues_found?: boolean
        }
        Update: {
          company_id?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          model?: string
          reasoning_effort?: string
          request_payload?: Json
          response_payload?: Json | null
          rues_attempts?: string[]
          rues_data?: Json | null
          rues_found?: boolean
        }
        Relationships: []
      }
      company_tasks: {
        Row: {
          assigned_to: string | null
          company_id: string
          completed_date: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          offer_id: string | null
          status: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          offer_id?: string | null
          status?: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          offer_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_tasks_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "portfolio_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string
          created_at: string
          email: string
          gender: string
          id: string
          is_primary: boolean
          name: string
          notes: string
          phone: string
          position: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email?: string
          gender?: string
          id?: string
          is_primary?: boolean
          name: string
          notes?: string
          phone?: string
          position?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          gender?: string
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string
          phone?: string
          position?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_categories: {
        Row: {
          created_at: string
          id: string
          level1_label: string
          level2_label: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          level1_label?: string
          level2_label?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          level1_label?: string
          level2_label?: string
          name?: string
        }
        Relationships: []
      }
      crm_category_verticals: {
        Row: {
          category: string
          created_at: string
          id: string
          vertical_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          vertical_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          vertical_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_category_verticals_vertical_id_fkey"
            columns: ["vertical_id"]
            isOneToOne: false
            referencedRelation: "crm_verticals"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sub_verticals: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      crm_vertical_sub_verticals: {
        Row: {
          created_at: string
          id: string
          sub_vertical_id: string
          vertical_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sub_vertical_id: string
          vertical_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sub_vertical_id?: string
          vertical_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_vertical_sub_verticals_sub_vertical_id_fkey"
            columns: ["sub_vertical_id"]
            isOneToOne: false
            referencedRelation: "crm_sub_verticals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_vertical_sub_verticals_vertical_id_fkey"
            columns: ["vertical_id"]
            isOneToOne: false
            referencedRelation: "crm_verticals"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_verticals: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      custom_field_values: {
        Row: {
          company_id: string
          created_at: string
          field_id: string
          id: string
          number_value: number | null
          text_value: string | null
          year_values: Json | null
        }
        Insert: {
          company_id: string
          created_at?: string
          field_id: string
          id?: string
          number_value?: number | null
          text_value?: string | null
          year_values?: Json | null
        }
        Update: {
          company_id?: string
          created_at?: string
          field_id?: string
          id?: string
          number_value?: number | null
          text_value?: string | null
          year_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          created_at: string
          display_order: number
          field_type: string
          id: string
          name: string
          options: Json | null
          section_id: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          field_type?: string
          id?: string
          name: string
          options?: Json | null
          section_id?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          field_type?: string
          id?: string
          name?: string
          options?: Json | null
          section_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "custom_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_properties: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          type: string
          value: string | null
          year_values: Json | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          type?: string
          value?: string | null
          year_values?: Json | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          type?: string
          value?: string | null
          year_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_properties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_sections: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      feature_settings: {
        Row: {
          config: Json
          created_at: string
          feature_key: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          feature_key: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          feature_key?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      milestones: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          date: string
          description: string
          id: string
          title: string
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          title: string
          type?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          reference_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      offer_allies: {
        Row: {
          ally_id: string
          created_at: string
          id: string
          offer_id: string
        }
        Insert: {
          ally_id: string
          created_at?: string
          id?: string
          offer_id: string
        }
        Update: {
          ally_id?: string
          created_at?: string
          id?: string
          offer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_allies_ally_id_fkey"
            columns: ["ally_id"]
            isOneToOne: false
            referencedRelation: "allies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_allies_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "portfolio_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_entries: {
        Row: {
          added_by: string | null
          assigned_to: string | null
          company_id: string
          created_at: string
          id: string
          notes: string
          offer_id: string
          stage_id: string
        }
        Insert: {
          added_by?: string | null
          assigned_to?: string | null
          company_id: string
          created_at?: string
          id?: string
          notes?: string
          offer_id: string
          stage_id: string
        }
        Update: {
          added_by?: string | null
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          id?: string
          notes?: string
          offer_id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_entries_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "portfolio_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_entries_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_notes: {
        Row: {
          company_id: string | null
          company_ids: Json | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          offer_id: string
          stage_id: string | null
        }
        Insert: {
          company_id?: string | null
          company_ids?: Json | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          offer_id: string
          stage_id?: string | null
        }
        Update: {
          company_id?: string | null
          company_ids?: Json | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          offer_id?: string
          stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_notes_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "portfolio_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_notes_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string
          counts_as_management: boolean
          created_at: string
          display_order: number
          icon: string
          id: string
          name: string
          offer_id: string
        }
        Insert: {
          color?: string
          counts_as_management?: boolean
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          name: string
          offer_id: string
        }
        Update: {
          color?: string
          counts_as_management?: boolean
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          name?: string
          offer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "portfolio_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_offer_categories: {
        Row: {
          color: string
          created_at: string
          display_order: number
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      portfolio_offer_types: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      portfolio_offers: {
        Row: {
          category_id: string | null
          created_at: string
          description: string
          end_date: string | null
          id: string
          name: string
          product: string
          start_date: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          name: string
          product?: string
          start_date?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          name?: string
          product?: string
          start_date?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_offers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "portfolio_offer_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          name: string
          phone: string
          position: string
          segment: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string
          position?: string
          segment?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string
          position?: string
          segment?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
        }
        Relationships: []
      }
      segments: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
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
      match_companies: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          company_id: string
          content: string
          id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "usuario" | "gerente" | "admin"
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
      app_role: ["usuario", "gerente", "admin"],
    },
  },
} as const
