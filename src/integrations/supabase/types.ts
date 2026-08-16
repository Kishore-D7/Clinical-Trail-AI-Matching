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
      clinical_trials: {
        Row: {
          condition: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          nct_id: string | null
          phase: string | null
          sponsor: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["trial_status"]
          title: string
          trial_code: string
          updated_at: string
        }
        Insert: {
          condition?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          nct_id?: string | null
          phase?: string | null
          sponsor?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["trial_status"]
          title: string
          trial_code: string
          updated_at?: string
        }
        Update: {
          condition?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          nct_id?: string | null
          phase?: string | null
          sponsor?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["trial_status"]
          title?: string
          trial_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          doc_type: string | null
          file_name: string
          id: string
          patient_id: string | null
          processing_status: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: string | null
          file_name: string
          id?: string
          patient_id?: string | null
          processing_status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string | null
          file_name?: string
          id?: string
          patient_id?: string | null
          processing_status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_list_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_ai_extractions: {
        Row: {
          average_confidence: number | null
          created_at: string
          created_by: string | null
          document_id: string | null
          error_message: string | null
          extracted_at: string
          field_count: number
          fields_extracted: string[]
          id: string
          model: string | null
          patient_id: string
          status: Database["public"]["Enums"]["extraction_run_status"]
          updated_at: string
        }
        Insert: {
          average_confidence?: number | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          error_message?: string | null
          extracted_at?: string
          field_count?: number
          fields_extracted?: string[]
          id?: string
          model?: string | null
          patient_id: string
          status?: Database["public"]["Enums"]["extraction_run_status"]
          updated_at?: string
        }
        Update: {
          average_confidence?: number | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          error_message?: string | null
          extracted_at?: string
          field_count?: number
          fields_extracted?: string[]
          id?: string
          model?: string | null
          patient_id?: string
          status?: Database["public"]["Enums"]["extraction_run_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_ai_extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "patient_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_ai_extractions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_list_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_ai_extractions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_conditions: {
        Row: {
          created_at: string
          diagnosed_on: string | null
          id: string
          name: string
          notes: string | null
          patient_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          diagnosed_on?: string | null
          id?: string
          name: string
          notes?: string | null
          patient_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          diagnosed_on?: string | null
          id?: string
          name?: string
          notes?: string | null
          patient_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_conditions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_list_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_conditions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_documents: {
        Row: {
          created_at: string
          doc_type: string | null
          file_name: string
          id: string
          page_count: number | null
          patient_id: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: string | null
          file_name: string
          id?: string
          page_count?: number | null
          patient_id: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string | null
          file_name?: string
          id?: string
          page_count?: number | null
          patient_id?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_list_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_measurements: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          id: string
          measured_on: string | null
          metric: Database["public"]["Enums"]["measurement_metric"]
          notes: string | null
          original_value: number | null
          patient_id: string
          source: Database["public"]["Enums"]["extraction_source"]
          source_document_id: string | null
          source_page: number | null
          unit: string
          updated_at: string
          value: number
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          measured_on?: string | null
          metric: Database["public"]["Enums"]["measurement_metric"]
          notes?: string | null
          original_value?: number | null
          patient_id: string
          source?: Database["public"]["Enums"]["extraction_source"]
          source_document_id?: string | null
          source_page?: number | null
          unit?: string
          updated_at?: string
          value: number
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          measured_on?: string | null
          metric?: Database["public"]["Enums"]["measurement_metric"]
          notes?: string | null
          original_value?: number | null
          patient_id?: string
          source?: Database["public"]["Enums"]["extraction_source"]
          source_document_id?: string | null
          source_page?: number | null
          unit?: string
          updated_at?: string
          value?: number
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_measurements_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_list_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_measurements_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_measurements_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "patient_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medications: {
        Row: {
          created_at: string
          dosage: string | null
          ended_on: string | null
          frequency: string | null
          id: string
          name: string
          notes: string | null
          patient_id: string
          started_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          ended_on?: string | null
          frequency?: string | null
          id?: string
          name: string
          notes?: string | null
          patient_id: string
          started_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dosage?: string | null
          ended_on?: string | null
          frequency?: string | null
          id?: string
          name?: string
          notes?: string | null
          patient_id?: string
          started_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_list_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          age: number | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          full_name: string | null
          id: string
          patient_code: string
          primary_condition: string | null
          sex: string | null
          status: string
          updated_at: string
        }
        Insert: {
          age?: number | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          patient_code: string
          primary_condition?: string | null
          sex?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          age?: number | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          patient_code?: string
          primary_condition?: string | null
          sex?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          job_title: string | null
          organization: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          organization?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          organization?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trial_criteria: {
        Row: {
          created_at: string
          created_by: string | null
          criterion_type: Database["public"]["Enums"]["criterion_type"]
          description: string | null
          field: string
          id: string
          operator: string
          required: boolean
          trial_id: string
          unit: string | null
          updated_at: string
          value: string
          value_secondary: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criterion_type?: Database["public"]["Enums"]["criterion_type"]
          description?: string | null
          field: string
          id?: string
          operator: string
          required?: boolean
          trial_id: string
          unit?: string | null
          updated_at?: string
          value: string
          value_secondary?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criterion_type?: Database["public"]["Enums"]["criterion_type"]
          description?: string | null
          field?: string
          id?: string
          operator?: string
          required?: boolean
          trial_id?: string
          unit?: string | null
          updated_at?: string
          value?: string
          value_secondary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_criteria_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "clinical_trials"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_criteria_extractions: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_criteria: Json | null
          created_at: string
          created_by: string | null
          criteria_count: number
          error_message: string | null
          id: string
          is_mock: boolean
          model: string | null
          notes: string[]
          provider: string | null
          raw_response: Json | null
          source_name: string | null
          source_text: string
          source_type: string
          status: Database["public"]["Enums"]["criteria_extraction_status"]
          trial_id: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_criteria?: Json | null
          created_at?: string
          created_by?: string | null
          criteria_count?: number
          error_message?: string | null
          id?: string
          is_mock?: boolean
          model?: string | null
          notes?: string[]
          provider?: string | null
          raw_response?: Json | null
          source_name?: string | null
          source_text?: string
          source_type?: string
          status?: Database["public"]["Enums"]["criteria_extraction_status"]
          trial_id: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_criteria?: Json | null
          created_at?: string
          created_by?: string | null
          criteria_count?: number
          error_message?: string | null
          id?: string
          is_mock?: boolean
          model?: string | null
          notes?: string[]
          provider?: string | null
          raw_response?: Json | null
          source_name?: string | null
          source_text?: string
          source_type?: string
          status?: Database["public"]["Enums"]["criteria_extraction_status"]
          trial_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_criteria_extractions_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "clinical_trials"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_matches: {
        Row: {
          created_at: string
          id: string
          needs_review: boolean
          patient_id: string
          score: number | null
          status: string
          trial_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          needs_review?: boolean
          patient_id: string
          score?: number | null
          status?: string
          trial_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          needs_review?: boolean
          patient_id?: string
          score?: number | null
          status?: string
          trial_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_matches_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_list_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_matches_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_matches_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "clinical_trials"
            referencedColumns: ["id"]
          },
        ]
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
          role?: Database["public"]["Enums"]["app_role"]
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
      patient_list_view: {
        Row: {
          age: number | null
          bmi: number | null
          conditions_text: string | null
          created_at: string | null
          date_of_birth: string | null
          egfr: number | null
          full_name: string | null
          hba1c: number | null
          id: string | null
          patient_code: string | null
          primary_condition: string | null
          sex: string | null
          status: string | null
          updated_at: string | null
          verification_status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "RESEARCHER" | "CLINICAL_COORDINATOR" | "ADMIN"
      criteria_extraction_status:
        | "PENDING"
        | "PROCESSING"
        | "COMPLETED"
        | "FAILED"
        | "CONFIRMED"
        | "DISCARDED"
      criterion_type: "INCLUSION" | "EXCLUSION"
      extraction_run_status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
      extraction_source: "AI" | "MANUAL"
      measurement_metric:
        | "HBA1C"
        | "BMI"
        | "FASTING_GLUCOSE"
        | "SYSTOLIC_BP"
        | "DIASTOLIC_BP"
        | "LDL"
        | "EGFR"
      trial_status:
        | "DRAFT"
        | "RECRUITING"
        | "ACTIVE"
        | "PAUSED"
        | "COMPLETED"
        | "CLOSED"
      verification_status: "UNVERIFIED" | "VERIFIED" | "CORRECTED"
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
      app_role: ["RESEARCHER", "CLINICAL_COORDINATOR", "ADMIN"],
      criteria_extraction_status: [
        "PENDING",
        "PROCESSING",
        "COMPLETED",
        "FAILED",
        "CONFIRMED",
        "DISCARDED",
      ],
      criterion_type: ["INCLUSION", "EXCLUSION"],
      extraction_run_status: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      extraction_source: ["AI", "MANUAL"],
      measurement_metric: [
        "HBA1C",
        "BMI",
        "FASTING_GLUCOSE",
        "SYSTOLIC_BP",
        "DIASTOLIC_BP",
        "LDL",
        "EGFR",
      ],
      trial_status: [
        "DRAFT",
        "RECRUITING",
        "ACTIVE",
        "PAUSED",
        "COMPLETED",
        "CLOSED",
      ],
      verification_status: ["UNVERIFIED", "VERIFIED", "CORRECTED"],
    },
  },
} as const
