-- Custom trigger system: triggers, run logs, and per-item last-alerted tracking.
-- Tables live alongside boards/records/cell_values in public. No existing board
-- or item table is altered (lastAlertedAt lives in trigger_item_alerts).

CREATE TABLE IF NOT EXISTS public.triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  workspace_id text,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,

  -- scope: 'all' applies to every board/workspace below; 'selected' restricts to listed ids
  scope_mode text NOT NULL DEFAULT 'selected' CHECK (scope_mode IN ('all', 'selected')),
  scope_workspaces text[] NOT NULL DEFAULT '{}'::text[],
  scope_boards text[] NOT NULL DEFAULT '{}'::text[],

  -- run mode: manual | automatic | both
  run_mode text NOT NULL DEFAULT 'manual' CHECK (run_mode IN ('manual', 'automatic', 'both')),

  -- conditions JSON: nested condition group { logic: 'AND'|'OR', conditions: [ { columnId, columnName, operator, value } | group ] }
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- actions JSON: [{ id, type: 'send_email'|..., enabled: boolean, config: {...} }]
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- email settings (used when an email action is enabled)
  email_enabled boolean NOT NULL DEFAULT false,
  email_to_type text NOT NULL DEFAULT 'static' CHECK (email_to_type IN ('static', 'field')),
  email_to text[] NOT NULL DEFAULT '{}'::text[],
  email_to_field text, -- column key/label whose cell value is a recipient address
  email_cc text[] NOT NULL DEFAULT '{}'::text[],
  email_subject text NOT NULL DEFAULT '{{trigger}} alert on {{board}}',
  email_body text NOT NULL DEFAULT 'Hello, this is a trigger alert for item {{title}} on board {{board}}.',
  email_format text NOT NULL DEFAULT 'per_item' CHECK (email_format IN ('per_item', 'summary')),
  email_frequency_hours integer NOT NULL DEFAULT 24 CHECK (email_frequency_hours > 0),

  last_run_at timestamptz,
  run_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS triggers_scope_idx ON public.triggers (scope_mode);
CREATE INDEX IF NOT EXISTS triggers_enabled_idx ON public.triggers (enabled);
CREATE INDEX IF NOT EXISTS triggers_workspace_idx ON public.triggers (workspace_id);

ALTER TABLE public.triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "triggers_select" ON public.triggers;
CREATE POLICY "triggers_select" ON public.triggers FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "triggers_insert" ON public.triggers;
CREATE POLICY "triggers_insert" ON public.triggers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "triggers_update" ON public.triggers;
CREATE POLICY "triggers_update" ON public.triggers FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "triggers_delete" ON public.triggers;
CREATE POLICY "triggers_delete" ON public.triggers FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.trigger_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES public.triggers(id) ON DELETE CASCADE,
  board_id text,
  started_by text NOT NULL DEFAULT 'system', -- 'manual:<user>' | 'cron' | 'change:<user>'
  run_mode text NOT NULL,
  matched_count integer NOT NULL DEFAULT 0,
  emailed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'partial', 'failed')),
  error text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trigger_logs_trigger_idx ON public.trigger_logs (trigger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trigger_logs_board_idx ON public.trigger_logs (board_id, created_at DESC);

ALTER TABLE public.trigger_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trigger_logs_select" ON public.trigger_logs;
CREATE POLICY "trigger_logs_select" ON public.trigger_logs FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "trigger_logs_insert" ON public.trigger_logs;
CREATE POLICY "trigger_logs_insert" ON public.trigger_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Per-item last alert time so the same item is not re-alerted within the
-- frequency window. One row per (trigger, item).
CREATE TABLE IF NOT EXISTS public.trigger_item_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES public.triggers(id) ON DELETE CASCADE,
  record_id text NOT NULL,
  board_id text NOT NULL,
  last_alerted_at timestamptz NOT NULL DEFAULT now(),
  alert_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  unique (trigger_id, record_id)
);

CREATE INDEX IF NOT EXISTS trigger_item_alerts_lookup_idx ON public.trigger_item_alerts (trigger_id, record_id);
CREATE INDEX IF NOT EXISTS trigger_item_alerts_board_idx ON public.trigger_item_alerts (board_id);

ALTER TABLE public.trigger_item_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trigger_item_alerts_select" ON public.trigger_item_alerts;
CREATE POLICY "trigger_item_alerts_select" ON public.trigger_item_alerts FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "trigger_item_alerts_insert" ON public.trigger_item_alerts;
CREATE POLICY "trigger_item_alerts_insert" ON public.trigger_item_alerts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "trigger_item_alerts_update" ON public.trigger_item_alerts;
CREATE POLICY "trigger_item_alerts_update" ON public.trigger_item_alerts FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Seed: migrated "Send Overdue Alert Email" button as the first trigger.
-- Applies to all boards. Fires when Payment Status = Overdue, or when Due Date
-- is before today and Status is not Paid. Sends one email per matching item,
-- max once per 24 hours per item. Force-send bypasses the window on manual run.
INSERT INTO public.triggers (
  id, name, description, enabled, scope_mode, run_mode, conditions, actions,
  email_enabled, email_to_type, email_subject, email_body, email_format, email_frequency_hours
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Send Overdue Alert Email',
  'Migrated from the hardcoded overdue alert button. Alerts on overdue payments or past due dates that are not yet Paid.',
  true,
  'all',
  'both',
  jsonb_build_object(
    'logic', 'OR',
    'conditions', jsonb_build_array(
      jsonb_build_object('logic', 'AND', 'conditions', jsonb_build_array(
        jsonb_build_object('columnName', 'Payment Status', 'operator', 'equals', 'value', 'Overdue')
      )),
      jsonb_build_object('logic', 'AND', 'conditions', jsonb_build_array(
        jsonb_build_object('columnName', 'Due Date', 'operator', 'is_before', 'value', 'today'),
        jsonb_build_object('columnName', 'Status', 'operator', 'not_equals', 'value', 'Paid')
      ))
    )
  ),
  jsonb_build_array(
    jsonb_build_object('id', 'act-1', 'type', 'send_email', 'enabled', true, 'config', jsonb_build_object())
  ),
  true,
  'static',
  'Overdue alert: {{client}} - {{title}} ({{board}})',
  'Hello,\n\nThis is an automated overdue alert for item "{{title}}" on board "{{board}}".\n\nClient: {{client}}\nStatus: {{status}}\nDue date: {{due_date}}\nAmount: {{amount}}\n\nLink: {{link}}\n\nPowerweave Studio OS',
  'per_item',
  24
) ON CONFLICT (id) DO NOTHING;
