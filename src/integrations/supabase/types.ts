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
      absence_limits: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          max_days: number
          tenant_id: string
          updated_at: string
          warning_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_days: number
          tenant_id: string
          updated_at?: string
          warning_type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_days?: number
          tenant_id?: string
          updated_at?: string
          warning_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_limits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          is_pinned: boolean
          is_published: boolean
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_pinned?: boolean
          is_published?: boolean
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_pinned?: boolean
          is_published?: boolean
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author_id: string | null
          category: string | null
          content: string
          created_at: string | null
          excerpt: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          is_published: boolean | null
          published_at: string | null
          slug: string
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          content: string
          created_at?: string | null
          excerpt?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          is_published?: boolean | null
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          author_id?: string | null
          category?: string | null
          content?: string
          created_at?: string | null
          excerpt?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          is_published?: boolean | null
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_corrections: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attendance_id: string
          correction_type: string
          created_at: string | null
          employee_id: string
          id: string
          new_value: string
          original_value: string | null
          reason: string
          status: Database["public"]["Enums"]["request_status"] | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_id: string
          correction_type: string
          created_at?: string | null
          employee_id: string
          id?: string
          new_value: string
          original_value?: string | null
          reason: string
          status?: Database["public"]["Enums"]["request_status"] | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_id?: string
          correction_type?: string
          created_at?: string | null
          employee_id?: string
          id?: string
          new_value?: string
          original_value?: string | null
          reason?: string
          status?: Database["public"]["Enums"]["request_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_corrections_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_original_shift_id_fkey"
            columns: ["original_shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records_default: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance_records_p2025_07: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance_records_p2025_08: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance_records_p2025_09: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance_records_p2025_10: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance_records_p2025_11: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance_records_p2025_12: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance_records_p2026_01: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance_records_p2026_02: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance_records_p2026_03: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance_records_p2026_04: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance_records_partitioned: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string
          employee_id: string
          flexible_attendance_reason: string | null
          id: string
          is_corrected: boolean | null
          is_flexible_attendance: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          flexible_attendance_reason?: string | null
          id?: string
          is_corrected?: boolean | null
          is_flexible_attendance?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          employee_id: string | null
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_notification_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          invoice_id: string | null
          message: string
          metadata: Json | null
          notification_type: string
          recipient: string
          sent_at: string | null
          status: string
          subject: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          message: string
          metadata?: Json | null
          notification_type: string
          recipient: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_notification_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_notification_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      client_logos: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          logo_url: string
          name: string
          sort_order: number | null
          website_url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url: string
          name: string
          sort_order?: number | null
          website_url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string
          name?: string
          sort_order?: number | null
          website_url?: string | null
        }
        Relationships: []
      }
      cron_job_logs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          job_name: string
          result: Json | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          job_name: string
          result?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          job_name?: string
          result?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      employee_invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invitation_code: string
          invitation_type: string | null
          invited_by: string | null
          is_used: boolean | null
          name: string
          nik: string
          office_id: string | null
          opd_id: string | null
          phone: string | null
          rejection_reason: string | null
          status: string
          tenant_id: string
          updated_at: string | null
          used_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invitation_code: string
          invitation_type?: string | null
          invited_by?: string | null
          is_used?: boolean | null
          name: string
          nik: string
          office_id?: string | null
          opd_id?: string | null
          phone?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id: string
          updated_at?: string | null
          used_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invitation_code?: string
          invitation_type?: string | null
          invited_by?: string | null
          is_used?: boolean | null
          name?: string
          nik?: string
          office_id?: string | null
          opd_id?: string | null
          phone?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string | null
          used_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          allow_flexible_attendance: boolean | null
          android_id: string | null
          created_at: string | null
          device_id_last_reset: string | null
          device_id_reset_count: number | null
          email: string
          employee_category: string | null
          flexible_attendance_limit: number | null
          gelar_belakang: string | null
          gelar_depan: string | null
          gender: string | null
          golongan: string | null
          id: string
          is_active: boolean | null
          last_login_at: string | null
          last_login_device_id: string | null
          name: string
          nik: string
          nip: string | null
          office_id: string | null
          opd_id: string | null
          phone: string | null
          position: string | null
          position_id: string | null
          supervisor_id: string | null
          tenant_id: string
          updated_at: string | null
          user_id: string | null
          whatsapp: string | null
          work_unit_id: string | null
        }
        Insert: {
          address?: string | null
          allow_flexible_attendance?: boolean | null
          android_id?: string | null
          created_at?: string | null
          device_id_last_reset?: string | null
          device_id_reset_count?: number | null
          email: string
          employee_category?: string | null
          flexible_attendance_limit?: number | null
          gelar_belakang?: string | null
          gelar_depan?: string | null
          gender?: string | null
          golongan?: string | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          last_login_device_id?: string | null
          name: string
          nik: string
          nip?: string | null
          office_id?: string | null
          opd_id?: string | null
          phone?: string | null
          position?: string | null
          position_id?: string | null
          supervisor_id?: string | null
          tenant_id: string
          updated_at?: string | null
          user_id?: string | null
          whatsapp?: string | null
          work_unit_id?: string | null
        }
        Update: {
          address?: string | null
          allow_flexible_attendance?: boolean | null
          android_id?: string | null
          created_at?: string | null
          device_id_last_reset?: string | null
          device_id_reset_count?: number | null
          email?: string
          employee_category?: string | null
          flexible_attendance_limit?: number | null
          gelar_belakang?: string | null
          gelar_depan?: string | null
          gender?: string | null
          golongan?: string | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          last_login_device_id?: string | null
          name?: string
          nik?: string
          nip?: string | null
          office_id?: string | null
          opd_id?: string | null
          phone?: string | null
          position?: string | null
          position_id?: string | null
          supervisor_id?: string | null
          tenant_id?: string
          updated_at?: string | null
          user_id?: string | null
          whatsapp?: string | null
          work_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_work_unit_id_fkey"
            columns: ["work_unit_id"]
            isOneToOne: false
            referencedRelation: "work_units"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          question: string
          sort_order: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          question: string
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          question?: string
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faqs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_reports: {
        Row: {
          browser_info: string | null
          created_at: string
          employee_id: string | null
          feedback_type: string
          id: string
          message: string
          os_info: string | null
          rating: number | null
          reporter_name: string | null
          reporter_role: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          screenshot_url: string | null
          status: string
          survey_day: number | null
          tenant_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          browser_info?: string | null
          created_at?: string
          employee_id?: string | null
          feedback_type?: string
          id?: string
          message: string
          os_info?: string | null
          rating?: number | null
          reporter_name?: string | null
          reporter_role?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_url?: string | null
          status?: string
          survey_day?: number | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          browser_info?: string | null
          created_at?: string
          employee_id?: string | null
          feedback_type?: string
          id?: string
          message?: string
          os_info?: string | null
          rating?: number | null
          reporter_name?: string | null
          reporter_role?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_url?: string | null
          status?: string
          survey_day?: number | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_reports_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_ledger: {
        Row: {
          created_at: string
          gross_amount: number
          id: string
          invoice_id: string | null
          metadata: Json | null
          net_amount: number
          notes: string | null
          payment_method: string | null
          payment_source: string
          reference_number: string | null
          tenant_id: string | null
          transaction_date: string
          transaction_type: string
          vat_amount: number
          xendit_fee: number
        }
        Insert: {
          created_at?: string
          gross_amount: number
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          net_amount: number
          notes?: string | null
          payment_method?: string | null
          payment_source: string
          reference_number?: string | null
          tenant_id?: string | null
          transaction_date?: string
          transaction_type: string
          vat_amount?: number
          xendit_fee?: number
        }
        Update: {
          created_at?: string
          gross_amount?: number
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          net_amount?: number
          notes?: string | null
          payment_method?: string | null
          payment_source?: string
          reference_number?: string | null
          tenant_id?: string | null
          transaction_date?: string
          transaction_type?: string
          vat_amount?: number
          xendit_fee?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_ledger_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      flexible_attendance_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          employee_id: string
          id: string
          reason: string
          reason_type: string
          rejection_reason: string | null
          request_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id: string
          id?: string
          reason: string
          reason_type: string
          rejection_reason?: string | null
          request_date: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          reason?: string
          reason_type?: string
          rejection_reason?: string | null
          request_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flexible_attendance_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flexible_attendance_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flexible_attendance_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string | null
          date: string
          id: string
          is_national: boolean | null
          name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          is_national?: boolean | null
          name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          is_national?: boolean | null
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holidays_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_sections: {
        Row: {
          created_at: string | null
          id: string
          is_enabled: boolean | null
          section_key: string
          section_name: string
          settings: Json | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          section_key: string
          section_name: string
          settings?: Json | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          section_key?: string
          section_name?: string
          settings?: Json | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      institution_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          description_html: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          description_html?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          description_html?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          discount_amount: number
          due_date: string
          employee_count: number
          external_id: string | null
          gross_amount: number
          id: string
          invoice_number: string
          invoice_url: string | null
          issue_date: string
          marketing_id: string | null
          marketing_incentive_amount: number | null
          marketing_incentive_percentage: number | null
          marketing_name: string | null
          marketing_staff_id: string | null
          metadata: Json | null
          net_amount: number
          notes: string | null
          package_discount_percentage: number | null
          package_duration_months: number | null
          package_id: string | null
          package_name: string | null
          paid_at: string | null
          payment_method_type: string | null
          payment_proof_url: string | null
          price_per_employee: number
          rejection_reason: string | null
          status: string
          subscription_id: string | null
          subtotal: number
          tenant_id: string
          updated_at: string
          vat_amount: number
          vat_percentage: number
          verified_at: string | null
          verified_by: string | null
          xendit_fee: number
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          due_date: string
          employee_count?: number
          external_id?: string | null
          gross_amount: number
          id?: string
          invoice_number: string
          invoice_url?: string | null
          issue_date?: string
          marketing_id?: string | null
          marketing_incentive_amount?: number | null
          marketing_incentive_percentage?: number | null
          marketing_name?: string | null
          marketing_staff_id?: string | null
          metadata?: Json | null
          net_amount: number
          notes?: string | null
          package_discount_percentage?: number | null
          package_duration_months?: number | null
          package_id?: string | null
          package_name?: string | null
          paid_at?: string | null
          payment_method_type?: string | null
          payment_proof_url?: string | null
          price_per_employee: number
          rejection_reason?: string | null
          status?: string
          subscription_id?: string | null
          subtotal: number
          tenant_id: string
          updated_at?: string
          vat_amount?: number
          vat_percentage?: number
          verified_at?: string | null
          verified_by?: string | null
          xendit_fee?: number
        }
        Update: {
          created_at?: string
          discount_amount?: number
          due_date?: string
          employee_count?: number
          external_id?: string | null
          gross_amount?: number
          id?: string
          invoice_number?: string
          invoice_url?: string | null
          issue_date?: string
          marketing_id?: string | null
          marketing_incentive_amount?: number | null
          marketing_incentive_percentage?: number | null
          marketing_name?: string | null
          marketing_staff_id?: string | null
          metadata?: Json | null
          net_amount?: number
          notes?: string | null
          package_discount_percentage?: number | null
          package_duration_months?: number | null
          package_id?: string | null
          package_name?: string | null
          paid_at?: string | null
          payment_method_type?: string | null
          payment_proof_url?: string | null
          price_per_employee?: number
          rejection_reason?: string | null
          status?: string
          subscription_id?: string | null
          subtotal?: number
          tenant_id?: string
          updated_at?: string
          vat_amount?: number
          vat_percentage?: number
          verified_at?: string | null
          verified_by?: string | null
          xendit_fee?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_marketing_staff_id_fkey"
            columns: ["marketing_staff_id"]
            isOneToOne: false
            referencedRelation: "marketing_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "subscription_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          created_at: string | null
          employee_id: string
          end_date: string
          id: string
          is_half_day: boolean | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string
          rejection_reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"] | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string | null
          employee_id: string
          end_date: string
          id?: string
          is_half_day?: boolean | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string
          rejection_reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["request_status"] | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          is_half_day?: boolean | null
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string
          rejection_reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["request_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_payments: {
        Row: {
          account_name: string | null
          account_number: string | null
          amount: number
          bank_name: string | null
          created_at: string | null
          id: string
          invoice_number: string | null
          invoice_url: string | null
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          reference_number: string | null
          rejection_reason: string | null
          status: string | null
          subscription_id: string | null
          tenant_id: string
          transfer_proof_url: string | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          amount: number
          bank_name?: string | null
          created_at?: string | null
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          reference_number?: string | null
          rejection_reason?: string | null
          status?: string | null
          subscription_id?: string | null
          tenant_id: string
          transfer_proof_url?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          amount?: number
          bank_name?: string | null
          created_at?: string | null
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          reference_number?: string | null
          rejection_reason?: string | null
          status?: string | null
          subscription_id?: string | null
          tenant_id?: string
          transfer_proof_url?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_payments_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_staff: {
        Row: {
          created_at: string
          email: string | null
          id: string
          incentive_percentage: number
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          total_incentive_earned: number | null
          total_sales_amount: number | null
          total_sales_count: number | null
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          incentive_percentage?: number
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          total_incentive_earned?: number | null
          total_sales_amount?: number | null
          total_sales_count?: number | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          incentive_percentage?: number
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          total_incentive_earned?: number | null
          total_sales_amount?: number | null
          total_sales_count?: number | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      mutation_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          created_at: string
          employee_id: string
          id: string
          mutation_type: string
          original_data: Json
          reason: string
          rejection_reason: string | null
          requested_changes: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          employee_id: string
          id?: string
          mutation_type: string
          original_data?: Json
          reason: string
          rejection_reason?: string | null
          requested_changes?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          mutation_type?: string
          original_data?: Json
          reason?: string
          rejection_reason?: string | null
          requested_changes?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      national_holidays: {
        Row: {
          created_at: string | null
          date: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      news: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          image_url: string | null
          is_global: boolean | null
          is_published: boolean | null
          tenant_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_global?: boolean | null
          is_published?: boolean | null
          tenant_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_global?: boolean | null
          is_published?: boolean | null
          tenant_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          metadata?: Json | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      offices: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          late_tolerance_minutes: number | null
          latitude: number
          longitude: number
          name: string
          opd_id: string | null
          radius_meters: number | null
          tenant_id: string
          updated_at: string | null
          work_end_time: string | null
          work_start_time: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          late_tolerance_minutes?: number | null
          latitude: number
          longitude: number
          name: string
          opd_id?: string | null
          radius_meters?: number | null
          tenant_id: string
          updated_at?: string | null
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          late_tolerance_minutes?: number | null
          latitude?: number
          longitude?: number
          name?: string
          opd_id?: string | null
          radius_meters?: number | null
          tenant_id?: string
          updated_at?: string | null
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offices_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      opd: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opd_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opd_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      opd_admins: {
        Row: {
          can_approve_leave: boolean | null
          can_export_reports: boolean | null
          can_invite_employees: boolean | null
          can_view_reports: boolean | null
          created_at: string | null
          created_by: string | null
          employee_id: string
          id: string
          is_active: boolean | null
          opd_id: string
        }
        Insert: {
          can_approve_leave?: boolean | null
          can_export_reports?: boolean | null
          can_invite_employees?: boolean | null
          can_view_reports?: boolean | null
          created_at?: string | null
          created_by?: string | null
          employee_id: string
          id?: string
          is_active?: boolean | null
          opd_id: string
        }
        Update: {
          can_approve_leave?: boolean | null
          can_export_reports?: boolean | null
          can_invite_employees?: boolean | null
          can_view_reports?: boolean | null
          created_at?: string | null
          created_by?: string | null
          employee_id?: string
          id?: string
          is_active?: boolean | null
          opd_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opd_admins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opd_admins_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opd_admins_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_type_settings: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          organization_type: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_type: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_type?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      overtime_request_dates: {
        Row: {
          created_at: string
          date: string
          end_time: string
          hours: number
          id: string
          is_holiday: boolean | null
          is_weekend: boolean | null
          notes: string | null
          overtime_request_id: string
          rate_multiplier: number | null
          start_time: string
        }
        Insert: {
          created_at?: string
          date: string
          end_time: string
          hours: number
          id?: string
          is_holiday?: boolean | null
          is_weekend?: boolean | null
          notes?: string | null
          overtime_request_id: string
          rate_multiplier?: number | null
          start_time: string
        }
        Update: {
          created_at?: string
          date?: string
          end_time?: string
          hours?: number
          id?: string
          is_holiday?: boolean | null
          is_weekend?: boolean | null
          notes?: string | null
          overtime_request_id?: string
          rate_multiplier?: number | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_request_dates_overtime_request_id_fkey"
            columns: ["overtime_request_id"]
            isOneToOne: false
            referencedRelation: "overtime_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          reason: string
          rejection_reason: string | null
          request_number: string
          status: string
          tenant_id: string
          total_hours: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          reason: string
          rejection_reason?: string | null
          request_number: string
          status?: string
          tenant_id: string
          total_hours?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          reason?: string
          rejection_reason?: string | null
          request_number?: string
          status?: string
          tenant_id?: string
          total_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_settings: {
        Row: {
          allow_multi_date_request: boolean | null
          auto_reject_after_days: number | null
          created_at: string
          holiday_rate_multiplier: number | null
          id: string
          is_enabled: boolean | null
          max_dates_per_request: number | null
          max_hours_per_day: number | null
          max_hours_per_month: number | null
          min_hours: number | null
          notes: string | null
          rate_multiplier: number | null
          requires_approval: boolean | null
          tenant_id: string
          updated_at: string
          weekend_rate_multiplier: number | null
        }
        Insert: {
          allow_multi_date_request?: boolean | null
          auto_reject_after_days?: number | null
          created_at?: string
          holiday_rate_multiplier?: number | null
          id?: string
          is_enabled?: boolean | null
          max_dates_per_request?: number | null
          max_hours_per_day?: number | null
          max_hours_per_month?: number | null
          min_hours?: number | null
          notes?: string | null
          rate_multiplier?: number | null
          requires_approval?: boolean | null
          tenant_id: string
          updated_at?: string
          weekend_rate_multiplier?: number | null
        }
        Update: {
          allow_multi_date_request?: boolean | null
          auto_reject_after_days?: number | null
          created_at?: string
          holiday_rate_multiplier?: number | null
          id?: string
          is_enabled?: boolean | null
          max_dates_per_request?: number | null
          max_hours_per_day?: number | null
          max_hours_per_month?: number | null
          min_hours?: number | null
          notes?: string | null
          rate_multiplier?: number | null
          requires_approval?: boolean | null
          tenant_id?: string
          updated_at?: string
          weekend_rate_multiplier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "overtime_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_otps: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          is_used: boolean | null
          otp_hash: string
          purpose: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          is_used?: boolean | null
          otp_hash: string
          purpose?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          is_used?: boolean | null
          otp_hash?: string
          purpose?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      payment_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          external_id: string | null
          id: string
          invoice_id: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          external_id?: string | null
          id?: string
          invoice_id?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          invoice_id?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          account_name: string | null
          account_number: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          sort_order: number | null
          type: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          sort_order?: number | null
          type?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          sort_order?: number | null
          type?: string | null
        }
        Relationships: []
      }
      positions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          opd_id: string | null
          tenant_id: string
          updated_at: string
          work_unit_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          opd_id?: string | null
          tenant_id: string
          updated_at?: string
          work_unit_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          opd_id?: string | null
          tenant_id?: string
          updated_at?: string
          work_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_work_unit_id_fkey"
            columns: ["work_unit_id"]
            isOneToOne: false
            referencedRelation: "work_units"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_otp: {
        Row: {
          attempt_count: number | null
          attempt_type: string
          first_attempt_at: string | null
          id: string
          identifier: string
          last_attempt_at: string | null
          locked_until: string | null
        }
        Insert: {
          attempt_count?: number | null
          attempt_type: string
          first_attempt_at?: string | null
          id?: string
          identifier: string
          last_attempt_at?: string | null
          locked_until?: string | null
        }
        Update: {
          attempt_count?: number | null
          attempt_type?: string
          first_attempt_at?: string | null
          id?: string
          identifier?: string
          last_attempt_at?: string | null
          locked_until?: string | null
        }
        Relationships: []
      }
      self_registered_users: {
        Row: {
          address: string | null
          created_at: string
          email: string
          id: string
          name: string
          status: string
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          status?: string
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      shift_change_logs: {
        Row: {
          attendance_id: string | null
          change_reason: string | null
          change_type: string
          changed_at: string
          changed_by: string | null
          employee_id: string
          id: string
          metadata: Json | null
          new_shift_id: string | null
          original_shift_id: string | null
          tenant_id: string
        }
        Insert: {
          attendance_id?: string | null
          change_reason?: string | null
          change_type: string
          changed_at?: string
          changed_by?: string | null
          employee_id: string
          id?: string
          metadata?: Json | null
          new_shift_id?: string | null
          original_shift_id?: string | null
          tenant_id: string
        }
        Update: {
          attendance_id?: string | null
          change_reason?: string | null
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          employee_id?: string
          id?: string
          metadata?: Json | null
          new_shift_id?: string | null
          original_shift_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_change_logs_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_change_logs_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_change_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_change_logs_new_shift_id_fkey"
            columns: ["new_shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_change_logs_original_shift_id_fkey"
            columns: ["original_shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_change_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stability_streaks: {
        Row: {
          created_at: string
          grace_period_end: string | null
          id: string
          last_activity_date: string | null
          reached_target: boolean | null
          reached_target_at: string | null
          status: string
          streak_count: number
          streak_started_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grace_period_end?: string | null
          id?: string
          last_activity_date?: string | null
          reached_target?: boolean | null
          reached_target_at?: string | null
          status?: string
          streak_count?: number
          streak_started_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grace_period_end?: string | null
          id?: string
          last_activity_date?: string | null
          reached_target?: boolean | null
          reached_target_at?: string | null
          status?: string
          streak_count?: number
          streak_started_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stability_streaks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_packages: {
        Row: {
          applies_to: string
          base_price_per_month: number
          created_at: string
          description: string | null
          discount_percentage: number
          duration_months: number
          features: Json | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          applies_to?: string
          base_price_per_month?: number
          created_at?: string
          description?: string | null
          discount_percentage?: number
          duration_months: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          applies_to?: string
          base_price_per_month?: number
          created_at?: string
          description?: string | null
          discount_percentage?: number
          duration_months?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          auto_renew: boolean | null
          billing_cycle: string | null
          created_at: string | null
          end_date: string | null
          grace_period_end: string | null
          id: string
          last_invoice_id: string | null
          max_employees: number | null
          max_offices: number | null
          notes: string | null
          payment_type: string | null
          price_per_employee: number | null
          price_per_month: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          auto_renew?: boolean | null
          billing_cycle?: string | null
          created_at?: string | null
          end_date?: string | null
          grace_period_end?: string | null
          id?: string
          last_invoice_id?: string | null
          max_employees?: number | null
          max_offices?: number | null
          notes?: string | null
          payment_type?: string | null
          price_per_employee?: number | null
          price_per_month?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          auto_renew?: boolean | null
          billing_cycle?: string | null
          created_at?: string | null
          end_date?: string | null
          grace_period_end?: string | null
          id?: string
          last_invoice_id?: string | null
          max_employees?: number | null
          max_offices?: number | null
          notes?: string | null
          payment_type?: string | null
          price_per_employee?: number | null
          price_per_month?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_last_invoice_id_fkey"
            columns: ["last_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tenants: {
        Row: {
          address: string | null
          apk_updated_at: string | null
          apk_url: string | null
          apk_version: string | null
          billing_mode: string
          billing_mode_updated_at: string | null
          code: string
          created_at: string | null
          description: string | null
          email: string | null
          id: string
          is_active: boolean | null
          landing_description: string | null
          landing_enabled: boolean | null
          landing_hero_image: string | null
          logo_url: string | null
          name: string
          npwp: string | null
          organization_type:
            | Database["public"]["Enums"]["organization_type"]
            | null
          owner_verified: boolean | null
          owner_verified_at: string | null
          phone: string | null
          pic_name: string | null
          pic_whatsapp: string | null
          timezone: string
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          apk_updated_at?: string | null
          apk_url?: string | null
          apk_version?: string | null
          billing_mode?: string
          billing_mode_updated_at?: string | null
          code: string
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          landing_description?: string | null
          landing_enabled?: boolean | null
          landing_hero_image?: string | null
          logo_url?: string | null
          name: string
          npwp?: string | null
          organization_type?:
            | Database["public"]["Enums"]["organization_type"]
            | null
          owner_verified?: boolean | null
          owner_verified_at?: string | null
          phone?: string | null
          pic_name?: string | null
          pic_whatsapp?: string | null
          timezone?: string
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          apk_updated_at?: string | null
          apk_url?: string | null
          apk_version?: string | null
          billing_mode?: string
          billing_mode_updated_at?: string | null
          code?: string
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          landing_description?: string | null
          landing_enabled?: boolean | null
          landing_hero_image?: string | null
          logo_url?: string | null
          name?: string
          npwp?: string | null
          organization_type?:
            | Database["public"]["Enums"]["organization_type"]
            | null
          owner_verified?: boolean | null
          owner_verified_at?: string | null
          phone?: string | null
          pic_name?: string | null
          pic_whatsapp?: string | null
          timezone?: string
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wfh_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          employee_id: string
          id: string
          reason: string
          rejection_reason: string | null
          request_date: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id: string
          id?: string
          reason: string
          rejection_reason?: string | null
          request_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          reason?: string
          rejection_reason?: string | null
          request_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wfh_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wfh_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      wfh_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          day_of_week: number | null
          description: string | null
          employee_id: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          is_recurring: boolean | null
          opd_id: string | null
          specific_date: string | null
          start_date: string | null
          tenant_id: string
          updated_at: string
          work_unit_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_of_week?: number | null
          description?: string | null
          employee_id?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          opd_id?: string | null
          specific_date?: string | null
          start_date?: string | null
          tenant_id: string
          updated_at?: string
          work_unit_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_of_week?: number | null
          description?: string | null
          employee_id?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          opd_id?: string | null
          specific_date?: string | null
          start_date?: string | null
          tenant_id?: string
          updated_at?: string
          work_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wfh_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wfh_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wfh_schedules_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wfh_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wfh_schedules_work_unit_id_fkey"
            columns: ["work_unit_id"]
            isOneToOne: false
            referencedRelation: "work_units"
            referencedColumns: ["id"]
          },
        ]
      }
      work_holidays: {
        Row: {
          created_at: string
          dates: string
          description: string | null
          id: string
          institution_type: string
          month: number
          tenant_id: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          dates: string
          description?: string | null
          id?: string
          institution_type?: string
          month: number
          tenant_id: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          dates?: string
          description?: string | null
          id?: string
          institution_type?: string
          month?: number
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_holidays_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_hours: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          institution_type: string
          is_active: boolean | null
          late_tolerance_minutes: number | null
          tenant_id: string
          time_in: string
          time_out: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          institution_type?: string
          is_active?: boolean | null
          late_tolerance_minutes?: number | null
          tenant_id: string
          time_in: string
          time_out: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          institution_type?: string
          is_active?: boolean | null
          late_tolerance_minutes?: number | null
          tenant_id?: string
          time_in?: string
          time_out?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_hours_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_shifts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          shift_name: string
          shift_order: number
          tenant_id: string
          time_end: string
          time_start: string
          tolerance_minutes: number | null
          updated_at: string
          work_unit_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          shift_name: string
          shift_order?: number
          tenant_id: string
          time_end: string
          time_start: string
          tolerance_minutes?: number | null
          updated_at?: string
          work_unit_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          shift_name?: string
          shift_order?: number
          tenant_id?: string
          time_end?: string
          time_start?: string
          tolerance_minutes?: number | null
          updated_at?: string
          work_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_shifts_work_unit_id_fkey"
            columns: ["work_unit_id"]
            isOneToOne: false
            referencedRelation: "work_units"
            referencedColumns: ["id"]
          },
        ]
      }
      work_units: {
        Row: {
          auto_shift_tolerance_minutes: number | null
          code: string | null
          created_at: string
          description: string | null
          enable_auto_shift: boolean | null
          id: string
          institution_type: string
          is_active: boolean | null
          name: string
          opd_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_shift_tolerance_minutes?: number | null
          code?: string | null
          created_at?: string
          description?: string | null
          enable_auto_shift?: boolean | null
          id?: string
          institution_type?: string
          is_active?: boolean | null
          name: string
          opd_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_shift_tolerance_minutes?: number | null
          code?: string | null
          created_at?: string
          description?: string | null
          enable_auto_shift?: boolean | null
          id?: string
          institution_type?: string
          is_active?: boolean | null
          name?: string
          opd_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_units_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_monthly_attendance_stats: {
        Row: {
          cuti: number | null
          employee_id: string | null
          hadir: number | null
          izin: number | null
          month: string | null
          pulang_cepat: number | null
          sakit: number | null
          terlambat: number | null
          terlambat_pulang_cepat: number | null
          tidak_hadir: number | null
          total: number | null
          tugas_luar: number | null
        }
        Relationships: []
      }
      v_attendance_records: {
        Row: {
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          date: string | null
          employee_id: string | null
          id: string | null
          is_corrected: boolean | null
          is_wfh: boolean | null
          notes: string | null
          office_id: string | null
          original_shift_id: string | null
          shift_change_reason: string | null
          shift_changed_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          updated_at: string | null
        }
        Insert: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string | null
          employee_id?: string | null
          id?: string | null
          is_corrected?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string | null
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Update: {
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          date?: string | null
          employee_id?: string | null
          id?: string | null
          is_corrected?: boolean | null
          is_wfh?: boolean | null
          notes?: string | null
          office_id?: string | null
          original_shift_id?: string | null
          shift_change_reason?: string | null
          shift_changed_at?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_link_employee_user: {
        Args: { p_employee_id: string; p_user_email: string }
        Returns: string
      }
      analyze_attendance_partitions: { Args: never; Returns: Json }
      calculate_invoice_amounts: {
        Args: {
          p_discount_percentage: number
          p_duration_months: number
          p_employee_count: number
          p_price_per_employee: number
          p_vat_percentage: number
        }
        Returns: Json
      }
      check_subscription_status: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      cleanup_gps_data_partitioned: { Args: never; Returns: Json }
      cleanup_old_audit_logs: { Args: never; Returns: Json }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      complete_employee_invitation_link: {
        Args: { p_invite_code: string }
        Returns: string
      }
      copy_default_tenant_data: {
        Args: { new_tenant_id: string; template_tenant_id?: string }
        Returns: undefined
      }
      create_pending_streak_invoice: {
        Args: { p_grace_days?: number; p_tenant_id: string }
        Returns: string
      }
      create_next_month_partition: { Args: never; Returns: undefined }
      generate_invoice_number: { Args: never; Returns: string }
      generate_overtime_request_number: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      get_gps_cleanup_logs: {
        Args: { limit_count?: number }
        Returns: {
          cutoff_date: string
          executed_at: string
          id: string
          partitions_processed: Json
          total_cleaned: number
        }[]
      }
      get_monthly_stats: {
        Args: { p_employee_id: string; p_month_start: string }
        Returns: {
          cuti: number
          hadir: number
          izin: number
          pulang_cepat: number
          sakit: number
          terlambat: number
          terlambat_pulang_cepat: number
          tidak_hadir: number
          tugas_luar: number
        }[]
      }
      get_feedback_stats_filtered: {
        Args: {
          p_feedback_type?: string | null
          p_rating?: number | null
          p_reporter_role?: string | null
          p_search?: string | null
        }
        Returns: {
          avg_rating: number | null
          open_bug_count: number | null
          total_count: number | null
        }[]
      }
      get_partition_creation_logs: {
        Args: { limit_count?: number }
        Returns: {
          created_at: string
          end_date: string
          id: string
          partition_name: string
          start_date: string
        }[]
      }
      get_partition_stats: {
        Args: never
        Returns: {
          date_range: string
          index_size: string
          partition_name: string
          row_count: number
          table_size: string
          total_size: string
        }[]
      }
      get_tenant_public_info: {
        Args: { _tenant_id: string }
        Returns: {
          code: string
          id: string
          logo_url: string
          name: string
          organization_type: Database["public"]["Enums"]["organization_type"]
        }[]
      }
      get_user_employee_id: { Args: { _user_id: string }; Returns: string }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      mark_streak_invoiced: {
        Args: { p_invoice_id?: string | null; p_tenant_id: string }
        Returns: undefined
      }
      log_critical_error: {
        Args: {
          p_action: string
          p_details?: Json
          p_error_message: string
          p_table_name: string
        }
        Returns: undefined
      }
      process_attendance_batch: { Args: { p_entries: Json }; Returns: Json }
      process_attendance_queue: {
        Args: {
          p_limit?: number
          p_queue_ids?: string[]
          p_trace_id?: string
        }
        Returns: Json
      }
      process_check_in: {
        Args: {
          p_date?: string
          p_distance_meters: number
          p_employee_id: string
          p_idempotency_key?: string
          p_latitude: number
          p_longitude: number
          p_office_id: string
        }
        Returns: Json
      }
      process_check_out: {
        Args: {
          p_date?: string
          p_distance_meters: number
          p_employee_id: string
          p_idempotency_key?: string
          p_latitude: number
          p_longitude: number
          p_office_id: string
        }
        Returns: Json
      }
      get_attendance_ingest_health: {
        Args: Record<PropertyKey, never>
        Returns: {
          avg_lag_seconds: number
          dead_count: number
          failed_count: number
          last_processed_at: string
          max_pending_age_seconds: number
          p95_lag_seconds: number
          processed_last_5m: number
          processed_last_60m: number
          processing_count: number
          queue_depth: number
        }[]
      }
      refresh_monthly_attendance_stats: { Args: never; Returns: undefined }
      sync_streak_subscription_status: {
        Args: { p_tenant_id?: string | null }
        Returns: Json
      }
      update_expired_leave_requests: { Args: never; Returns: undefined }
      update_tenant_streak: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      validate_invitation_code: {
        Args: { p_invitation_code: string }
        Returns: {
          email: string
          expires_at: string
          id: string
          invitation_type: string
          name: string
          nik: string
          office_id: string
          opd_id: string
          status: string
          tenant_code: string
          tenant_id: string
          tenant_logo_url: string
          tenant_name: string
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "admin_instansi" | "atasan" | "pegawai"
      article_category: "berita" | "tutorial" | "update" | "tips"
      attendance_status:
        | "hadir"
        | "terlambat"
        | "pulang_cepat"
        | "tidak_hadir"
        | "izin"
        | "cuti"
        | "sakit"
        | "tugas_luar"
        | "terlambat_pulang_cepat"
      leave_type:
        | "izin"
        | "cuti_tahunan"
        | "cuti_penting"
        | "cuti_lainnya"
        | "sakit"
        | "tugas_luar"
      organization_type:
        | "pemerintah_daerah"
        | "instansi_pemerintah"
        | "perusahaan"
        | "sekolah"
      request_status: "menunggu" | "disetujui" | "ditolak"
      subscription_status: "trial" | "active" | "expired" | "cancelled"
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
      app_role: ["super_admin", "admin_instansi", "atasan", "pegawai"],
      article_category: ["berita", "tutorial", "update", "tips"],
      attendance_status: [
        "hadir",
        "terlambat",
        "pulang_cepat",
        "tidak_hadir",
        "izin",
        "cuti",
        "sakit",
        "tugas_luar",
        "terlambat_pulang_cepat",
      ],
      leave_type: [
        "izin",
        "cuti_tahunan",
        "cuti_penting",
        "cuti_lainnya",
        "sakit",
        "tugas_luar",
      ],
      organization_type: [
        "pemerintah_daerah",
        "instansi_pemerintah",
        "perusahaan",
        "sekolah",
      ],
      request_status: ["menunggu", "disetujui", "ditolak"],
      subscription_status: ["trial", "active", "expired", "cancelled"],
    },
  },
} as const
