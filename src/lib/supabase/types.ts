// Tipos de la base de datos.
//
// TEMPORAL/hecho a mano para la Fase 1. Tras enlazar el proyecto Supabase,
// regenerar con:
//   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
// y mantener esta forma (Database) que consumen los clientes.

export type UnitType = "ud" | "g" | "kg" | "ml" | "l";
export type LocationType = "pantry" | "fridge" | "freezer" | "other";
export type MemberRole = "owner" | "member";

export type Database = {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          role: MemberRole;
          display_name: string | null;
          joined_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          role?: MemberRole;
          display_name?: string | null;
          joined_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          role?: MemberRole;
          display_name?: string | null;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_household: {
        Args: { p_name: string; p_display_name?: string | null };
        Returns: string;
      };
      join_household_by_code: {
        Args: { p_code: string; p_display_name?: string | null };
        Returns: string;
      };
      regenerate_invite_code: {
        Args: { p_household_id: string };
        Returns: string;
      };
    };
    Enums: {
      unit_type: UnitType;
      location_type: LocationType;
      member_role: MemberRole;
    };
    CompositeTypes: Record<never, never>;
  };
};
