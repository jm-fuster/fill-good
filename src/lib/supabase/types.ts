// Tipos de la base de datos.
//
// TEMPORAL/hecho a mano para la Fase 1. Tras enlazar el proyecto Supabase,
// regenerar con:
//   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
// y mantener esta forma (Database) que consumen los clientes.

export type UnitType = "ud" | "g" | "kg" | "ml" | "l";
export type LocationType = "pantry" | "fridge" | "freezer" | "other";
export type MemberRole = "owner" | "member";
export type InventoryEventKind = "consumed" | "discarded" | "restocked";

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
          monthly_budget: number | null;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code: string;
          created_by: string;
          created_at?: string;
          monthly_budget?: number | null;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_by?: string;
          created_at?: string;
          monthly_budget?: number | null;
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
      household_menu_prefs: {
        Row: {
          household_id: string;
          goal: string;
          diet_style: string;
          avoid_text: string | null;
          servings: number;
          plan_breakfast: boolean;
          updated_at: string;
        };
        Insert: {
          household_id: string;
          goal?: string;
          diet_style?: string;
          avoid_text?: string | null;
          servings?: number;
          plan_breakfast?: boolean;
          updated_at?: string;
        };
        Update: {
          household_id?: string;
          goal?: string;
          diet_style?: string;
          avoid_text?: string | null;
          servings?: number;
          plan_breakfast?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_menu_prefs_household_id_fkey";
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
          pack_size: number | null;
          preferred_chain: string | null;
          // Señales de precio materializadas (L15 f2/f3). Estructura de savings_tip
          // = ChainSavingsTip (src/features/prices/chain-savings.ts).
          inferred_chain: string | null;
          savings_tip: {
            currentChain: string;
            cheaperChain: string;
            savingsPct: number;
          } | null;
          icon: string | null;
          purchase_count: number;
          last_purchased_at: string | null;
          /** Hasta cuándo no sugerir este producto en /lista (null = no silenciado). */
          suggestions_snoozed_until: string | null;
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
          pack_size?: number | null;
          preferred_chain?: string | null;
          inferred_chain?: string | null;
          savings_tip?: {
            currentChain: string;
            cheaperChain: string;
            savingsPct: number;
          } | null;
          icon?: string | null;
          purchase_count?: number;
          last_purchased_at?: string | null;
          suggestions_snoozed_until?: string | null;
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
          pack_size?: number | null;
          preferred_chain?: string | null;
          inferred_chain?: string | null;
          savings_tip?: {
            currentChain: string;
            cheaperChain: string;
            savingsPct: number;
          } | null;
          icon?: string | null;
          purchase_count?: number;
          last_purchased_at?: string | null;
          suggestions_snoozed_until?: string | null;
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
          use_soon: boolean;
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
          use_soon?: boolean;
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
          use_soon?: boolean;
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
      inventory_events: {
        Row: {
          id: string;
          household_id: string;
          product_id: string;
          quantity: number;
          unit: UnitType;
          kind: InventoryEventKind;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          product_id: string;
          quantity: number;
          unit?: UnitType;
          kind: InventoryEventKind;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          product_id?: string;
          quantity?: number;
          unit?: UnitType;
          kind?: InventoryEventKind;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_events_product_id_fkey";
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
      push_subscriptions: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          pref_expiry: boolean;
          pref_price: boolean;
          pref_restock: boolean;
          pref_wins: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          pref_expiry?: boolean;
          pref_price?: boolean;
          pref_restock?: boolean;
          pref_wins?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          pref_expiry?: boolean;
          pref_price?: boolean;
          pref_restock?: boolean;
          pref_wins?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shopping_trips: {
        Row: {
          id: string;
          household_id: string;
          closed_at: string;
          closed_by: string | null;
          product_ids: string[];
          item_count: number;
          receipt_id: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          closed_at?: string;
          closed_by?: string | null;
          product_ids?: string[];
          item_count?: number;
          receipt_id?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          closed_at?: string;
          closed_by?: string | null;
          product_ids?: string[];
          item_count?: number;
          receipt_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_trips_household_id_fkey";
            columns: ["household_id"];
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_trips_receipt_id_fkey";
            columns: ["receipt_id"];
            referencedRelation: "receipts";
            referencedColumns: ["id"];
          },
        ];
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
          discount_total: number;
          savings_amount: number;
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
          discount_total?: number;
          savings_amount?: number;
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
          discount_total?: number;
          savings_amount?: number;
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
          suggested_product_id: string | null;
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
          suggested_product_id?: string | null;
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
          suggested_product_id?: string | null;
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
      recipes: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          description: string | null;
          servings: number;
          prep_minutes: number | null;
          meal_types: string[] | null;
          seasons: string[];
          instructions: string | null;
          source: string;
          is_saved: boolean;
          normalized_name: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          description?: string | null;
          servings?: number;
          prep_minutes?: number | null;
          meal_types?: string[] | null;
          seasons?: string[];
          instructions?: string | null;
          source?: string;
          is_saved?: boolean;
          normalized_name?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          description?: string | null;
          servings?: number;
          prep_minutes?: number | null;
          meal_types?: string[] | null;
          seasons?: string[];
          instructions?: string | null;
          source?: string;
          is_saved?: boolean;
          normalized_name?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      recipe_ingredients: {
        Row: {
          id: string;
          recipe_id: string;
          household_id: string;
          product_id: string | null;
          name: string;
          quantity: number | null;
          unit: UnitType | null;
          optional: boolean;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          household_id: string;
          product_id?: string | null;
          name: string;
          quantity?: number | null;
          unit?: UnitType | null;
          optional?: boolean;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          household_id?: string;
          product_id?: string | null;
          name?: string;
          quantity?: number | null;
          unit?: UnitType | null;
          optional?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey";
            columns: ["recipe_id"];
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_menus: {
        Row: {
          id: string;
          household_id: string;
          week_start: string;
          status: string;
          generated_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          week_start: string;
          status?: string;
          generated_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          week_start?: string;
          status?: string;
          generated_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      menu_entries: {
        Row: {
          id: string;
          menu_id: string;
          household_id: string;
          date: string;
          meal_slot: string;
          recipe_id: string | null;
          free_text: string | null;
          servings: number;
          position: number;
          cooked_at: string | null;
          source: string;
          pinned: boolean;
        };
        Insert: {
          id?: string;
          menu_id: string;
          household_id: string;
          date: string;
          meal_slot: string;
          recipe_id?: string | null;
          free_text?: string | null;
          servings?: number;
          position?: number;
          cooked_at?: string | null;
          source?: string;
          pinned?: boolean;
        };
        Update: {
          id?: string;
          menu_id?: string;
          household_id?: string;
          date?: string;
          meal_slot?: string;
          recipe_id?: string | null;
          free_text?: string | null;
          servings?: number;
          position?: number;
          cooked_at?: string | null;
          source?: string;
          pinned?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "menu_entries_menu_id_fkey";
            columns: ["menu_id"];
            referencedRelation: "weekly_menus";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_entries_recipe_id_fkey";
            columns: ["recipe_id"];
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_ratings: {
        Row: {
          id: string;
          household_id: string;
          recipe_id: string;
          user_id: string;
          rating: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          recipe_id: string;
          user_id: string;
          rating: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          recipe_id?: string;
          user_id?: string;
          rating?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ratings_recipe_id_fkey";
            columns: ["recipe_id"];
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      user_pinned_products: {
        Row: {
          user_id: string;
          household_id: string;
          product_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          household_id: string;
          product_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          household_id?: string;
          product_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_pinned_products_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_rules: {
        Row: {
          id: string;
          household_id: string;
          kind: string;
          recipe_id: string | null;
          value: number | null;
          text_rule: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          kind: string;
          recipe_id?: string | null;
          value?: number | null;
          text_rule?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          kind?: string;
          recipe_id?: string | null;
          value?: number | null;
          text_rule?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_rules_recipe_id_fkey";
            columns: ["recipe_id"];
            referencedRelation: "recipes";
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
        // null = el código no corresponde a ningún hogar (ver migración de
        // rate-limit: el código inválido devuelve null en vez de lanzar error).
        Returns: string | null;
      };
      regenerate_invite_code: {
        Args: { p_household_id: string };
        Returns: string;
      };
      is_household_owner: {
        Args: { hid: string };
        Returns: boolean;
      };
      transfer_household_ownership: {
        Args: { p_household_id: string; p_new_owner_user_id: string };
        Returns: undefined;
      };
      rename_household: {
        Args: { p_household_id: string; p_name: string };
        Returns: undefined;
      };
      set_member_display_name: {
        Args: { p_household_id: string; p_display_name: string };
        Returns: undefined;
      };
      delete_household: {
        Args: { p_household_id: string };
        Returns: undefined;
      };
      leave_household: {
        Args: { p_household_id: string };
        Returns: undefined;
      };
      delete_account: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      seed_default_categories: {
        Args: { hid: string };
        Returns: undefined;
      };
      seed_default_products: {
        Args: { hid: string };
        Returns: undefined;
      };
      ensure_active_list: {
        Args: { hid: string };
        Returns: undefined;
      };
      bump_product_purchase: {
        Args: { pid: string };
        Returns: undefined;
      };
      bump_product_purchases: {
        Args: { pids: string[] };
        Returns: undefined;
      };
      merge_products: {
        Args: { p_source: string; p_target: string };
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
