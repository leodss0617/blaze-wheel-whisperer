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
      blaze_rounds: {
        Row: {
          blaze_id: string
          color: string
          created_at: string
          id: string
          number: number
          round_timestamp: string
        }
        Insert: {
          blaze_id: string
          color: string
          created_at?: string
          id?: string
          number: number
          round_timestamp: string
        }
        Update: {
          blaze_id?: string
          color?: string
          created_at?: string
          id?: string
          number?: number
          round_timestamp?: string
        }
        Relationships: []
      }
      learned_patterns: {
        Row: {
          created_at: string
          id: string
          last_result: string | null
          pattern_data: Json
          pattern_key: string
          pattern_type: string
          success_rate: number | null
          times_correct: number
          times_seen: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_result?: string | null
          pattern_data: Json
          pattern_key: string
          pattern_type: string
          success_rate?: number | null
          times_correct?: number
          times_seen?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_result?: string | null
          pattern_data?: Json
          pattern_key?: string
          pattern_type?: string
          success_rate?: number | null
          times_correct?: number
          times_seen?: number
          updated_at?: string
        }
        Relationships: []
      }
      prediction_signals: {
        Row: {
          actual_result: string | null
          confidence: number
          created_at: string
          id: string
          predicted_color: string
          protections: number
          reason: string
          signal_timestamp: string
          status: string
          updated_at: string
        }
        Insert: {
          actual_result?: string | null
          confidence: number
          created_at?: string
          id?: string
          predicted_color: string
          protections?: number
          reason: string
          signal_timestamp: string
          status?: string
          updated_at?: string
        }
        Update: {
          actual_result?: string | null
          confidence?: number
          created_at?: string
          id?: string
          predicted_color?: string
          protections?: number
          reason?: string
          signal_timestamp?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      white_patterns: {
        Row: {
          average_gap_when_appeared: number | null
          created_at: string
          gap_range: string
          id: string
          sequence_before_white: string[] | null
          times_seen: number
          times_white_appeared: number
          updated_at: string
        }
        Insert: {
          average_gap_when_appeared?: number | null
          created_at?: string
          gap_range: string
          id?: string
          sequence_before_white?: string[] | null
          times_seen?: number
          times_white_appeared?: number
          updated_at?: string
        }
        Update: {
          average_gap_when_appeared?: number | null
          created_at?: string
          gap_range?: string
          id?: string
          sequence_before_white?: string[] | null
          times_seen?: number
          times_white_appeared?: number
          updated_at?: string
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
