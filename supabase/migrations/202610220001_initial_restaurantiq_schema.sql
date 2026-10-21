DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'restaurantiq_app'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Existing restaurantiq_app role has unsafe or unexpected attributes; inspect it before applying this migration.';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'restaurantiq_app') THEN
    EXECUTE 'CREATE ROLE restaurantiq_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS';
  END IF;
END;
$$;

CREATE TABLE public.restaurants (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.outlets (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  city text NOT NULL,
  locality text NOT NULL,
  postal_code text NOT NULL,
  research_radius_km numeric(8, 3) NOT NULL CHECK (research_radius_km >= 0),
  delivery_commission_pct numeric(8, 5) NOT NULL CHECK (delivery_commission_pct >= 0 AND delivery_commission_pct < 100),
  packaging_cost_default numeric(14, 2) NOT NULL CHECK (packaging_cost_default >= 0),
  is_active boolean NOT NULL DEFAULT false,
  latitude numeric(9, 6) NOT NULL,
  longitude numeric(9, 6) NOT NULL,
  UNIQUE (restaurant_id, name)
);

CREATE TABLE public.pricing_policies (
  restaurant_id text PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  active_outlet_id text REFERENCES public.outlets(id) ON DELETE RESTRICT,
  currency_symbol text NOT NULL,
  currency_code text NOT NULL,
  max_movement_pct numeric(8, 6) NOT NULL CHECK (max_movement_pct > 0 AND max_movement_pct <= 1),
  max_increase_pct numeric(8, 6) NOT NULL CHECK (max_increase_pct > 0 AND max_increase_pct <= 1),
  max_decrease_pct numeric(8, 6) NOT NULL CHECK (max_decrease_pct > 0 AND max_decrease_pct <= 1),
  minimum_days_between_price_changes integer NOT NULL CHECK (minimum_days_between_price_changes >= 0),
  cumulative_increase_limit_pct numeric(8, 6) NOT NULL CHECK (cumulative_increase_limit_pct > 0),
  cumulative_increase_window_days integer NOT NULL CHECK (cumulative_increase_window_days > 0),
  trust_risk_review_threshold_pct numeric(8, 6) NOT NULL CHECK (trust_risk_review_threshold_pct > 0),
  loyalty_price_protection boolean NOT NULL DEFAULT false,
  default_min_contribution numeric(14, 2) NOT NULL CHECK (default_min_contribution >= 0),
  rounding_step numeric(14, 2) NOT NULL CHECK (rounding_step > 0),
  data_freshness_max_days integer NOT NULL CHECK (data_freshness_max_days >= 0),
  require_manual_approval_threshold_pct numeric(8, 6) NOT NULL CHECK (require_manual_approval_threshold_pct >= 0),
  pos_integration jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.protected_price_categories (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  category text NOT NULL,
  PRIMARY KEY (restaurant_id, category)
);

CREATE TABLE public.menu_items (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  sku text NOT NULL,
  current_price numeric(14, 2) NOT NULL CHECK (current_price > 0),
  dine_in_price numeric(14, 2) CHECK (dine_in_price IS NULL OR dine_in_price > 0),
  delivery_price numeric(14, 2) CHECK (delivery_price IS NULL OR delivery_price > 0),
  ingredient_cost numeric(14, 2) NOT NULL CHECK (ingredient_cost >= 0),
  packaging_cost numeric(14, 2) NOT NULL CHECK (packaging_cost >= 0),
  total_variable_cost numeric(14, 2) NOT NULL CHECK (total_variable_cost >= 0),
  min_contribution numeric(14, 2) NOT NULL CHECK (min_contribution >= 0),
  min_policy_price numeric(14, 2) NOT NULL CHECK (min_policy_price >= 0),
  max_policy_price numeric(14, 2) NOT NULL CHECK (max_policy_price >= current_price),
  inventory_qty numeric(14, 3) NOT NULL CHECK (inventory_qty >= 0),
  reorder_threshold numeric(14, 3) NOT NULL CHECK (reorder_threshold >= 0),
  status text NOT NULL CHECK (status IN ('active', 'inactive')),
  demand_trend text NOT NULL CHECK (demand_trend IN ('surging', 'steady', 'softening')),
  portion_grams numeric(12, 3) NOT NULL CHECK (portion_grams > 0),
  last_updated timestamptz NOT NULL,
  historical_sales_last_30_days numeric(14, 3) NOT NULL DEFAULT 0 CHECK (historical_sales_last_30_days >= 0),
  is_synthetic_demo_data boolean NOT NULL DEFAULT false,
  UNIQUE (restaurant_id, sku)
);

CREATE TABLE public.protected_menu_items (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  PRIMARY KEY (restaurant_id, menu_item_id)
);

CREATE TABLE public.daily_sales (
  menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  sales_date date NOT NULL,
  day_of_week text NOT NULL,
  orders integer NOT NULL CHECK (orders >= 0),
  revenue numeric(14, 2) NOT NULL CHECK (revenue >= 0),
  series_name text NOT NULL CHECK (series_name IN ('dailySalesHistory', 'dailySalesLast60Days')),
  PRIMARY KEY (menu_item_id, sales_date, series_name)
);

CREATE TABLE public.competitors (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  distance_km numeric(10, 3) NOT NULL CHECK (distance_km >= 0),
  rating numeric(4, 2) NOT NULL CHECK (rating >= 0 AND rating <= 5),
  cuisine_type text NOT NULL,
  price_tier text NOT NULL,
  address text NOT NULL,
  active_matches_count integer NOT NULL DEFAULT 0 CHECK (active_matches_count >= 0),
  last_scanned_at timestamptz NOT NULL,
  source_type text,
  latitude numeric(9, 6),
  longitude numeric(9, 6)
);

CREATE TABLE public.competitor_observations (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  competitor_id text NOT NULL REFERENCES public.competitors(id) ON DELETE RESTRICT,
  menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  competitor_name text NOT NULL,
  menu_item_name text NOT NULL,
  dish_name text NOT NULL,
  observed_price numeric(14, 2) NOT NULL CHECK (observed_price > 0),
  is_available boolean NOT NULL,
  portion_grams numeric(12, 3) NOT NULL CHECK (portion_grams > 0),
  confidence_score numeric(8, 6) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  freshness_timestamp timestamptz NOT NULL,
  is_simulated boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  provenance_label text
);

CREATE TABLE public.menu_matches (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  menu_item_name text NOT NULL,
  competitor_dish_name text NOT NULL,
  competitor_name text NOT NULL,
  portion_internal_grams numeric(12, 3) NOT NULL CHECK (portion_internal_grams > 0),
  portion_competitor_grams numeric(12, 3) NOT NULL CHECK (portion_competitor_grams > 0),
  observed_price numeric(14, 2) NOT NULL CHECK (observed_price > 0),
  normalized_price numeric(14, 2) NOT NULL CHECK (normalized_price > 0),
  confidence_score numeric(8, 6) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  match_status text NOT NULL CHECK (match_status IN ('high_confidence', 'needs_review', 'rejected')),
  explanation text NOT NULL
);

CREATE TABLE public.inventory_items (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  category text NOT NULL,
  stock_qty numeric(14, 3) NOT NULL CHECK (stock_qty >= 0),
  unit text NOT NULL,
  reorder_point numeric(14, 3) NOT NULL CHECK (reorder_point >= 0),
  cost_per_unit numeric(14, 4) NOT NULL CHECK (cost_per_unit >= 0),
  price_change_last_30_days_pct numeric(8, 6) NOT NULL,
  status text NOT NULL CHECK (status IN ('healthy', 'low_stock', 'critical', 'surplus')),
  last_restocked timestamptz NOT NULL
);

CREATE TABLE public.inventory_menu_items (
  inventory_item_id text NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  PRIMARY KEY (inventory_item_id, menu_item_id)
);

CREATE TABLE public.pricing_recommendations (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  menu_item_name text NOT NULL,
  category text NOT NULL,
  current_price numeric(14, 2) NOT NULL CHECK (current_price > 0),
  suggested_price numeric(14, 2) NOT NULL CHECK (suggested_price > 0),
  price_delta numeric(14, 2) NOT NULL,
  price_delta_pct numeric(10, 6) NOT NULL,
  variable_cost numeric(14, 2) NOT NULL CHECK (variable_cost >= 0),
  current_contribution numeric(14, 2) NOT NULL,
  suggested_contribution numeric(14, 2) NOT NULL,
  current_contribution_margin_pct numeric(10, 6) NOT NULL,
  suggested_contribution_margin_pct numeric(10, 6) NOT NULL,
  gross_contribution_margin_pct_current numeric(10, 6),
  gross_contribution_margin_pct_suggested numeric(10, 6),
  competitor_median numeric(14, 2) NOT NULL CHECK (competitor_median >= 0),
  demand_index numeric(10, 6) NOT NULL CHECK (demand_index >= 0),
  inventory_ratio numeric(10, 6) NOT NULL CHECK (inventory_ratio >= 0),
  confidence_score numeric(8, 6) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'applied', 'rejected', 'deferred')),
  reason text NOT NULL,
  economic_floor numeric(14, 2) NOT NULL CHECK (economic_floor >= 0),
  policy_floor numeric(14, 2) NOT NULL CHECK (policy_floor >= 0),
  policy_ceiling numeric(14, 2) NOT NULL CHECK (policy_ceiling >= 0),
  policy_checks_passed boolean NOT NULL,
  is_blocked boolean NOT NULL,
  requires_step_override boolean NOT NULL,
  constraint_status text NOT NULL,
  flag_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_actual_price_change_at timestamptz,
  recent_price_changes jsonb,
  cumulative_increase_pct numeric(10, 6),
  stability_policy_status text,
  customer_trust_risk jsonb,
  candidates jsonb,
  assumptions jsonb,
  approved_by text,
  applied_by text,
  rejected_by text,
  rejection_reason text,
  idempotency_key text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (restaurant_id, idempotency_key)
);

CREATE TABLE public.price_changes (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  menu_item_name text NOT NULL,
  previous_price numeric(14, 2) NOT NULL CHECK (previous_price > 0),
  new_price numeric(14, 2) NOT NULL CHECK (new_price > 0 AND new_price <> previous_price),
  changed_at timestamptz NOT NULL,
  actor text NOT NULL,
  source text NOT NULL CHECK (source IN ('recommendation', 'manual_override')),
  rationale text NOT NULL,
  recommendation_id text REFERENCES public.pricing_recommendations(id) ON DELETE SET NULL,
  UNIQUE (recommendation_id)
);

CREATE TABLE public.audit_events (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  timestamp timestamptz NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  menu_item_id text REFERENCES public.menu_items(id) ON DELETE SET NULL,
  menu_item_name text,
  previous_price numeric(14, 2),
  new_price numeric(14, 2),
  rationale text NOT NULL,
  policy_checks_passed boolean NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.agent_executions (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  agent_key text NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  last_run text NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  input_summary text NOT NULL,
  output_summary text NOT NULL,
  items_processed integer NOT NULL CHECK (items_processed >= 0),
  quality_score numeric(8, 6),
  confidence_score numeric(8, 6),
  is_simulated_telemetry boolean NOT NULL,
  execution_mode text NOT NULL
);

CREATE TABLE public.json_import_batches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_sha256 text NOT NULL UNIQUE,
  source_file_name text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  included_demo_data boolean NOT NULL,
  record_counts jsonb NOT NULL,
  imported_by text NOT NULL
);

CREATE TABLE public.schema_migrations (
  version text PRIMARY KEY,
  checksum_sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outlets_restaurant_id_idx ON public.outlets (restaurant_id);
CREATE INDEX menu_items_restaurant_category_idx ON public.menu_items (restaurant_id, category);
CREATE INDEX competitor_observations_item_time_idx ON public.competitor_observations (menu_item_id, freshness_timestamp DESC);
CREATE INDEX daily_sales_date_idx ON public.daily_sales (menu_item_id, sales_date DESC);
CREATE INDEX recommendations_restaurant_status_idx ON public.pricing_recommendations (restaurant_id, status, created_at DESC);
CREATE INDEX price_changes_item_time_idx ON public.price_changes (menu_item_id, changed_at DESC);
CREATE INDEX audit_events_restaurant_time_idx ON public.audit_events (restaurant_id, timestamp DESC);
CREATE INDEX inventory_restaurant_idx ON public.inventory_items (restaurant_id);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'restaurants', 'outlets', 'pricing_policies', 'protected_price_categories',
    'menu_items', 'protected_menu_items', 'daily_sales', 'competitors',
    'competitor_observations', 'menu_matches', 'inventory_items',
    'inventory_menu_items', 'pricing_recommendations', 'price_changes',
    'audit_events', 'agent_executions', 'json_import_batches'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY restaurantiq_app_access ON public.%I TO restaurantiq_app USING (pg_has_role(current_user, %L, %L)) WITH CHECK (pg_has_role(current_user, %L, %L))',
      table_name, 'restaurantiq_app', 'member', 'restaurantiq_app', 'member'
    );
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      table_name
    );
    IF table_name IN ('price_changes', 'audit_events') THEN
      EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO restaurantiq_app', table_name);
    ELSIF table_name = 'json_import_batches' THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO restaurantiq_app', table_name);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO restaurantiq_app', table_name);
    END IF;
  END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA public TO restaurantiq_app;
REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC, anon, authenticated, service_role, restaurantiq_app;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SEQUENCE public.json_import_batches_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.json_import_batches_id_seq TO restaurantiq_app;
