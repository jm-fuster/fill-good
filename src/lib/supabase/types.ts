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
      categories: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          icon: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          normalized_name: string;
          category_id: string | null;
          default_unit: UnitType;
          default_location: LocationType;
          min_quantity: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          normalized_name: string;
          category_id?: string | null;
          default_unit?: UnitType;
          default_location?: LocationType;
          min_quantity?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          normalized_name?: string;
          category_id?: string | null;
          default_unit?: UnitType;
          default_location?: LocationType;
          min_quantity?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shopping_lists: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name?: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      shopping_list_items: {
        Row: {
          id: string;
          list_id: string;
          household_id: string;
          product_id: string | null;
          name: string;
          quantity: number | null;
          unit: UnitType | null;
          is_checked: boolean;
          checked_by: string | null;
          checked_at: string | null;
          added_by: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          list_id: string;
          household_id: string;
          product_id?: string | null;
          name: string;
          quantity?: number | null;
          unit?: UnitType | null;
          is_checked?: boolean;
          checked_by?: string | null;
          checked_at?: string | null;
          added_by?: string | null;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          list_id?: string;
          household_id?: string;
          product_id?: string | null;
          name?: string;
          quantity?: number | null;
          unit?: UnitType | null;
          is_checked?: boolean;
          checked_by?: string | null;
          checked_at?: string | null;
          added_by?: string | null;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_list_id_fkey";
            columns: ["list_id"];
            referencedRelation: "shopping_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_items: {
        Row: {
          id: string;
          household_id: string;
          product_id: string;
          location: LocationType;
          quantity: number;
          unit: UnitType;
          expiry_date: string | null;
          notes: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          product_id: string;
          location?: LocationType;
          quantity?: number;
          unit?: UnitType;
          expiry_date?: string | null;
          notes?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          product_id?: string;
          location?: LocationType;
          quantity?: number;
          unit?: UnitType;
          expiry_date?: string | null;
          notes?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_items_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_aliases: {
        Row: {
          id: string;
          household_id: string;
          product_id: string;
          alias: string;
          alias_normalized: string;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          product_id: string;
          alias: string;
          alias_normalized: string;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          product_id?: string;
          alias?: string;
          alias_normalized?: string;
          source?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      receipts: {
        Row: {
          id: string;
          household_id: string;
          uploaded_by: string | null;
          store_name: string | null;
          store_chain: string | null;
          purchased_at: string | null;
          total_amount: number | null;
          currency: string;
          image_path: string | null;
          status: string;
          raw_extraction: unknown | null;
          created_at: string;
          confirmed_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          uploaded_by?: string | null;
          store_name?: string | null;
          store_chain?: string | null;
          purchased_at?: string | null;
          total_amount?: number | null;
          currency?: string;
          image_path?: string | null;
          status?: string;
          raw_extraction?: unknown | null;
          created_at?: string;
          confirmed_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          uploaded_by?: string | null;
          store_name?: string | null;
          store_chain?: string | null;
          purchased_at?: string | null;
          total_amount?: number | null;
          currency?: string;
          image_path?: string | null;
          status?: string;
          raw_extraction?: unknown | null;
          created_at?: string;
          confirmed_at?: string | null;
        };
        Relationships: [];
      };
      receipt_items: {
        Row: {
          id: string;
          receipt_id: string;
          household_id: string;
          raw_text: string | null;
          description: string;
          quantity: number;
          unit: UnitType;
          is_weighted: boolean;
          total_price: number | null;
          unit_price: number | null;
          price_per_kg: number | null;
          product_id: string | null;
          match_status: string;
          added_to_inventory: boolean;
          purchased_at: string | null;
          store_chain: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          receipt_id: string;
          household_id: string;
          raw_text?: string | null;
          description: string;
          quantity?: number;
          unit?: UnitType;
          is_weighted?: boolean;
          total_price?: number | null;
          unit_price?: number | null;
          price_per_kg?: number | null;
          product_id?: string | null;
          match_status?: string;
          added_to_inventory?: boolean;
          purchased_at?: string | null;
          store_chain?: string | null;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          receipt_id?: string;
          household_id?: string;
          raw_text?: string | null;
          description?: string;
          quantity?: number;
          unit?: UnitType;
          is_weighted?: boolean;
          total_price?: number | null;
          unit_price?: number | null;
          price_per_kg?: number | null;
          product_id?: string | null;
          match_status?: string;
          added_to_inventory?: boolean;
          purchased_at?: string | null;
          store_chain?: string | null;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "receipt_items_receipt_id_fkey";
            columns: ["receipt_id"];
            referencedRelation: "receipts";
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
      seed_default_categories: {
        Args: { hid: string };
        Returns: undefined;
      };
      ensure_active_list: {
        Args: { hid: string };
        Returns: undefined;
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
