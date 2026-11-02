-- Email notification automations for board jobs

CREATE TABLE IF NOT EXISTS public.email_notification_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id text NOT NULL,
  workspace_id text,
  organization_id text,
  trigger_type text NOT NULL DEFAULT 'job_status_pending',
  receiver_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_notification_automations_board_id_idx ON public.email_notification_automations (board_id);

ALTER TABLE public.email_notification_automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS \"email_notification_automations_select\" ON public.email_notification_automations;
CREATE POLICY \"email_notification_automations_select\" ON public.email_notification_automations FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS \"email_notification_automations_insert\" ON public.email_notification_automations;
CREATE POLICY \"email_notification_automations_insert\" ON public.email_notification_automations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS \"email_notification_automations_update\" ON public.email_notification_automations;
CREATE POLICY \"email_notification_automations_update\" ON public.email_notification_automations FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.email_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid REFERENCES public.email_notification_automations(id) ON DELETE CASCADE,
  board_id text NOT NULL,
  job_id text NOT NULL,
  receiver_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','sent','failed')),
  sent_at timestamptz,
  error text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_notification_logs_job_idx ON public.email_notification_logs (job_id, receiver_email);
CREATE INDEX IF NOT EXISTS email_notification_logs_automation_idx ON public.email_notification_logs (automation_id);

ALTER TABLE public.email_notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS \"email_notification_logs_select\" ON public.email_notification_logs;
CREATE POLICY \"email_notification_logs_select\" ON public.email_notification_logs FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS \"email_notification_logs_insert\" ON public.email_notification_logs;
CREATE POLICY \"email_notification_logs_insert\" ON public.email_notification_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS \"email_notification_logs_update\" ON public.email_notification_logs;
CREATE POLICY \"email_notification_logs_update\" ON public.email_notification_logs FOR UPDATE USING (auth.uid() IS NOT NULL);
