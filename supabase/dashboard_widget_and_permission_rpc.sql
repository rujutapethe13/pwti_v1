  -- ════════════════════════════════════════════════════════════════════════════════
  -- Powerweave Studio OS — Dashboard Widgets & Permission RPC
  -- ════════════════════════════════════════════════════════════════════════════════
  --
  -- PRECEDENCE:
  --   Apply AFTER migrations 001–007 (containment, roles, grants, visibility,
  --   invitations, audit_log, RLS policies).
  --
  -- WHAT THIS MIGRATION DOES:
  --   1. Creates `widget_type` enum (distinct from `resource_type` enum —
  --      `widget_type` identifies the kind of widget; `resource_type` is for
  --      permission checks and already includes 'widget' and 'dashboard').
  --   2. Creates `dashboard_widgets` table with RLS following the exact same
  --      pattern established in Stage 1 (SELECT via is_workspace_member, write
  --      via check_permission_manage SECURITY DEFINER helper).
  --   3. Creates `can_user()` RPC function — the SINGLE source of truth for
  --      client-side permission checks. No reimplementation of precedence logic
  --      in JavaScript.
  --
  -- ── RLS Pattern (matches Stage 1) ───────────────────────────
  --   SELECT: is_workspace_member(workspace_id)
  --   INSERT: check_permission_manage(workspace_id, 'dashboard')
  --   UPDATE: check_permission_manage(workspace_id, 'dashboard')
  --   DELETE: check_permission_manage(workspace_id, 'dashboard')
  --
  -- ════════════════════════════════════════════════════════════════════════════════

  -- ════════════════════════════════════════════════════════════════════════════════
  -- 1. WIDGET TYPE ENUM
  -- ════════════════════════════════════════════════════════════════════════════════
  -- This is a separate concept from resource_type (permissions enum).
  --   - resource_type = 'widget' means "a widget instance as a permission target"
  --   - widget_type   = 'kpi_card' means "render this widget as a KPI card"
  -- They serve different purposes and should NOT be conflated.

  do $$ begin
    create type public.widget_type as enum (
      'kpi_card',
      'bar_chart',
      'line_chart',
      'table',
      'progress_ring',
      -- Tier 1 chart variants (Phase 2)
      'chart_horizontal_bar',
      'chart_stacked_bar',
      'chart_grouped_bar',
      'chart_spline',
      'chart_area',
      'chart_stacked_area',
      'chart_pie',
      'chart_donut',
      'chart_scatter',
      'chart_radar',
      'chart_funnel',
      'chart_gauge',
      'chart_battery',

      -- Tier 2 widgets (Phase 2 — unblocked)
      'calendar',
      'recent_activity',
      'ai_summary',
      'custom_widget'
    );
  exception
    when duplicate_object then null;
  end $$;

  -- ════════════════════════════════════════════════════════════════════════════════
  -- 2. DASHBOARD WIDGETS TABLE
  -- ════════════════════════════════════════════════════════════════════════════════

  drop table if exists public.dashboard_widgets cascade;
create table if not exists public.dashboard_widgets (
    id uuid primary key default gen_random_uuid(),

    -- ── Containment (same pattern as all Stage 1 tables) ────
    organization_id text not null references public.organizations(id) on delete cascade,
    workspace_id    text not null references public.workspaces(id) on delete cascade,
    dashboard_id    text not null,   -- FK to dashboards table (external)

    -- ── Widget identity ─────────────────────────────────────
    widget_type  public.widget_type not null,
    title        text not null default 'Untitled Widget',

    -- ── Layout position (react-grid-layout format) ──────────
    -- Stores a single GridItem: { x, y, w, h, minW?, minH? }
    -- The Dashboard entity stores the full layout array per breakpoint;
    -- this table stores the individual item for persistence.
    position jsonb not null default '{"x":0,"y":0,"w":4,"h":3}'::jsonb,

    -- ── Widget config (validated by Zod on read/write) ──────
    -- Shape:
    -- {
    --   connected_board_id: string,
    --   metric_column_id: string,
    --   aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max',
    --   group_by_column_id?: string,
    --   x_axis_column_id?: string,
    --   filters?: FilterExpression[],
    --   refresh_rate_seconds?: number
    -- }
    config jsonb not null default '{}'::jsonb,

    -- ── Metadata ────────────────────────────────────────────
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- ── Indexes ────────────────────────────────────────────────

  create index if not exists dashboard_widgets_dashboard_id_idx
    on public.dashboard_widgets (dashboard_id);

  create index if not exists dashboard_widgets_workspace_id_idx
    on public.dashboard_widgets (workspace_id);

  create index if not exists dashboard_widgets_widget_type_idx
    on public.dashboard_widgets (widget_type);

  -- ── Updated_at trigger ─────────────────────────────────────

  create or replace function public.update_dashboard_widgets_updated_at()
  returns trigger as $$
  begin
    new.updated_at = now();
    return new;
  end;
  $$ language plpgsql;

  drop trigger if exists trg_dashboard_widgets_updated_at on public.dashboard_widgets;
  create trigger trg_dashboard_widgets_updated_at
    before update on public.dashboard_widgets
    for each row
    execute function public.update_dashboard_widgets_updated_at();

  -- ════════════════════════════════════════════════════════════════════════════════
  -- 3. ROW-LEVEL SECURITY (exact same pattern as Stage 1)
  -- ════════════════════════════════════════════════════════════════════════════════

  alter table public.dashboard_widgets enable row level security;

  -- SELECT: workspace members can view widgets in their workspace
  drop policy if exists "dashboard_widgets_select_workspace_member" on public.dashboard_widgets;
create policy "dashboard_widgets_select_workspace_member" on public.dashboard_widgets
    for select
    using (
      public.is_workspace_member(workspace_id)
    );

  -- INSERT: requires `manage` on `dashboard` resource_type
  drop policy if exists "dashboard_widgets_insert_manage" on public.dashboard_widgets;
create policy "dashboard_widgets_insert_manage" on public.dashboard_widgets
    for insert
    with check (
      public.check_permission_manage(workspace_id, 'dashboard')
    );

  -- UPDATE: requires `manage` on `dashboard` resource_type
  drop policy if exists "dashboard_widgets_update_manage" on public.dashboard_widgets;
create policy "dashboard_widgets_update_manage" on public.dashboard_widgets
    for update
    using (
      public.check_permission_manage(workspace_id, 'dashboard')
    );

  -- DELETE: requires `manage` on `dashboard` resource_type
  drop policy if exists "dashboard_widgets_delete_manage" on public.dashboard_widgets;
create policy "dashboard_widgets_delete_manage" on public.dashboard_widgets
    for delete
    using (
      public.check_permission_manage(workspace_id, 'dashboard')
    );

  -- ════════════════════════════════════════════════════════════════════════════════
  -- 4. can_user() RPC — Single Source of Truth for Client-Side Permission Checks
  -- ════════════════════════════════════════════════════════════════════════════════
  --
  -- PURPOSE:
  --   Exposes the same resolution logic that check_permission_manage() uses,
  --   but as a general-purpose RPC callable from the client via supabase.rpc().
  --   The client never reimplements precedence logic — it calls this function.
  --
  -- RESOLUTION ORDER (matches Stage 1 design):
  --   1. Explicit DENY  (user_id + resource_id + action) → false
  --   2. Explicit ALLOW (user_id + resource_id + action) → true
  --   3. Role DENY      (role_id + resource_id + action)  → false
  --   4. Role ALLOW     (role_id + resource_id + action)  → true
  --   5. Workspace default → false
  --
  -- PARAMETERS:
  --   p_user_id         — The user to check (typically auth.uid())
  --   p_action          — The action to check (view, create, edit, delete, manage, etc.)
  --   p_resource_type   — The resource type (workspace, board, dashboard, widget, etc.)
  --   p_resource_id     — Optional: specific resource ID (null = check applies to all)
  --   p_workspace_id    — The workspace context
  --
  -- RETURNS:
  --   boolean — true if the action is allowed, false otherwise
  --
  -- USAGE:
  --   SELECT * FROM can_user(auth.uid(), 'edit', 'dashboard', 'some-dashboard-id', 'ws-main');
  --   SELECT * FROM can_user(auth.uid(), 'create', 'widget', NULL, 'ws-main');
  --
  -- NOTE:
  --   This function is SECURITY DEFINER to bypass RLS (it needs to READ
  --   permission_grants without triggering recursive policy evaluation).
  --   It only READS, never writes — no privilege escalation risk.
  -- ════════════════════════════════════════════════════════════════════════════════

  create or replace function public.can_user(
    p_user_id uuid,
    p_action public.permission_action,
    p_resource_type public.resource_type,
    p_resource_id text default null,
    p_workspace_id text default null
  )
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = public
  as $$
  declare
    v_workspace_id text;
  begin
    -- If no workspace_id provided, try to find one from the user's memberships
    -- (for resource types that aren't workspace-scoped)
    if p_workspace_id is null then
      select wm.workspace_id into v_workspace_id
      from public.workspace_members wm
      where wm.user_id = p_user_id
      limit 1;

      if v_workspace_id is null then
        return false; -- User has no workspace memberships
      end if;
    else
      v_workspace_id := p_workspace_id;
    end if;

    -- ═════════════════════════════════════════════════════════
    -- Resolution Step 1: Explicit DENY (user + resource)
    -- ═════════════════════════════════════════════════════════
    if exists (
      select 1 from public.permission_grants
      where workspace_id = v_workspace_id
        and user_id = p_user_id
        and resource_type = p_resource_type
        and (resource_id = p_resource_id or (resource_id is null and p_resource_id is null))
        and action = p_action
        and effect = 'deny'
    ) then
      return false;
    end if;

    -- ═════════════════════════════════════════════════════════
    -- Resolution Step 2: Explicit ALLOW (user + resource)
    -- ═════════════════════════════════════════════════════════
    if exists (
      select 1 from public.permission_grants
      where workspace_id = v_workspace_id
        and user_id = p_user_id
        and resource_type = p_resource_type
        and (resource_id = p_resource_id or (resource_id is null and p_resource_id is null))
        and action = p_action
        and effect = 'allow'
    ) then
      return true;
    end if;

    -- ═════════════════════════════════════════════════════════
    -- Resolution Step 3: Role-based DENY
    -- ═════════════════════════════════════════════════════════
    if exists (
      select 1 from public.workspace_members wm
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = p_resource_type
        and (pg.resource_id = p_resource_id or (pg.resource_id is null and p_resource_id is null))
        and pg.action = p_action
        and pg.effect = 'deny'
      where wm.user_id = p_user_id
        and wm.workspace_id = v_workspace_id
    ) then
      return false;
    end if;

    -- ═════════════════════════════════════════════════════════
    -- Resolution Step 4: Role-based ALLOW
    -- ═════════════════════════════════════════════════════════
    if exists (
      select 1 from public.workspace_members wm
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.resource_type = p_resource_type
        and (pg.resource_id = p_resource_id or (pg.resource_id is null and p_resource_id is null))
        and pg.action = p_action
        and pg.effect = 'allow'
      where wm.user_id = p_user_id
        and wm.workspace_id = v_workspace_id
    ) then
      return true;
    end if;

    -- ═════════════════════════════════════════════════════════
    -- Resolution Step 5: Workspace default → deny
    -- ═════════════════════════════════════════════════════════
    return false;
  end;
  $$;
