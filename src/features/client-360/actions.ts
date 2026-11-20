"use server";

import { buildAbsoluteUrl } from "@/lib/url";
import type { Client360SearchResult, Client360Filters, Client360PendingWorkResult, Client360ResolvedClient } from "./types";
import { isClientColumn } from "./constants";
import { searchClient360 } from "./search-service";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/organization";
import { getSessionIdentity } from "@/lib/rbac/resolve";
import { eventBus } from "@/features/boards/engine/events";
import type { DomainEventPayload } from "@/features/boards/engine/events";
import type { PermissionScope } from "@/features/boards/engine/types";
import type { Client360Profile, DealProject, TimelineActivity, NextBestAction } from "./relationship-types";
import { getAllClientsFromBoards } from "./client-list-service";
import type { ClientAnalytics, ClientAnalyticsDateRange } from "./client-analytics-service";

const CLIENT_ALIAS_GROUPS: Record<string, string[]> = {
  "nasher miles": ["nasher mile", "nasher miles"], bioweaves: ["bioweave", "bioweaves"],
  labbada: ["labada", "labbada"], "papa don't preach": ["papa don,t peach", "papa dont peach", "papa don't preach"],
  levis: ["levi's", "levis strauss & co", "levis strauss and co", "levis"], safari: ["safari select", "safari-genie", "safari"],
};
const normalizeClient = (value: string) => value.toLowerCase().replace(/[’']/g, "").replace(/&/g, "and").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
const toTitleCaseClientName = (value: string) => value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const aliasGroup = (value: string) => Object.values(CLIENT_ALIAS_GROUPS).find((group) => group.some((name) => normalizeClient(name) === normalizeClient(value))) ?? [value];

export async function getClientAnalyticsAction(input: {
  clientId: string;
  boardIds?: string[] | null;
  dateRange?: ClientAnalyticsDateRange | null;
}): Promise<{ data: ClientAnalytics | null; error: string | null }> {
  try {
    const organizationId = await getUserOrganizationId();
    if (!organizationId) return { data: null, error: "Organization not found" };
    const { getClientAnalytics } = await import("./client-analytics-service");
    return { data: await getClientAnalytics(input.clientId, organizationId, input.boardIds, input.dateRange), error: null };
  } catch (error) {
    console.error("Client 360 analytics failed:", error);
    return { data: null, error: "Failed to load analytics" };
  }
}

export async function searchClient360Action(
  query: string,
  options: {
    page?: number;
    pageSize?: number;
    filters?: Client360Filters;
  } = {},
): Promise<{ data: Client360SearchResult | null; error: string | null; status: number }> {
  try {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { data: null, error: "Query is required", status: 400 };
    }

    const result = await searchClient360(trimmed, options);
    return { data: result, error: null, status: 200 };
  } catch (err) {
    console.error("Client 360 search failed:", err);
    return { data: null, error: "Search failed. Please try again.", status: 500 };
  }
}

export async function getClient360InitialDataAction(): Promise<{
  data: {
    workspaces: Array<{ id: string; name: string }>;
    boards: Array<{ id: string; name: string; slug: string; workspaceId: string }>;
    clientColumns: Array<{ boardId: string; boardName: string; columnId: string; columnLabel: string; clientType?: string }>;
  } | null;
  error: string | null;
  status: number;
}> {
  try {
    const { getClient360InitialData } = await import("./search-service");
    const data = await getClient360InitialData();
    return { data, error: null, status: 200 };
  } catch (err) {
    console.error("Failed to load client-360 initial data:", err);
    return { data: null, error: "Failed to load data", status: 500 };
  }
}

export async function fetchAllClient360DataAction(
  options: {
    page?: number;
    pageSize?: number;
    filters?: Client360Filters;
    debug?: boolean;
  } = {},
): Promise<{ data: Client360SearchResult | null; error: string | null; status: number }> {
  try {
    const { fetchAllClient360Data } = await import("./search-service");
    const result = await fetchAllClient360Data(options);
    return { data: result, error: null, status: 200 };
  } catch (err) {
    console.error("Failed to fetch all client-360 data:", err);
    return { data: null, error: "Failed to load data", status: 500 };
  }
}

export async function createClient360ItemAction(input: {
  boardId: string;
  title: string;
  clientName: string;
  groupId?: string | null;
}): Promise<{ data: { recordId: string; boardId: string } | null; error: string | null; status: number }> {
  try {
    const title = input.title.trim();
    const clientName = input.clientName.trim();
    if (!input.boardId || !title || !clientName) {
      return { data: null, error: "Title and client name are required", status: 400 };
    }

    const supabase = await createServiceClient();
    const boardResult = await supabase
      .from("boards")
      .select("id, organization_id, workspace_id")
      .eq("id", input.boardId)
      .maybeSingle();

    if (boardResult.error || !boardResult.data) {
      return { data: null, error: "Board not found", status: 404 };
    }

    const columnsResult = await supabase
      .from("columns")
      .select("id, label, type, settings")
      .eq("board_id", input.boardId)
      .is("group_id", null)
      .order("sort_order", { ascending: true });

    if (columnsResult.error) {
      return { data: null, error: "Failed to load board columns", status: 500 };
    }

    const clientColumn = (columnsResult.data ?? []).find((column) => isClientColumn(column));
    const recordId = crypto.randomUUID();
    const now = new Date().toISOString();
    const scope: PermissionScope = {
      organizationId: boardResult.data.organization_id,
      workspaceId: boardResult.data.workspace_id,
      boardId: input.boardId,
    };
    const afterData: Record<string, unknown> = {
      id: recordId,
      title,
      status: "active",
      board_id: input.boardId,
    };

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "record.create:before",
      timestamp: now,
      actorUserId: "system",
      scope,
      before: null,
      after: afterData,
      metadata: { entityId: recordId },
    } as DomainEventPayload);

    const { error: recordError } = await supabase.from("records").insert({
      id: recordId,
      organization_id: boardResult.data.organization_id,
      workspace_id: boardResult.data.workspace_id,
      board_id: input.boardId,
      group_id: input.groupId || null,
      title,
      status: "active",
      version: 1,
      archived_at: null,
      created_at: now,
      updated_at: now,
    });

    if (recordError) {
      return { data: null, error: recordError.message, status: 500 };
    }

    if (clientColumn) {
      const { error: cellError } = await supabase.from("cell_values").insert({
        id: `${input.boardId}:${recordId}:${clientColumn.id}`,
        organization_id: boardResult.data.organization_id,
        workspace_id: boardResult.data.workspace_id,
        board_id: input.boardId,
        record_id: recordId,
        column_id: clientColumn.id,
        value: clientName,
        value_text: clientName,
        version: 1,
        updated_at: now,
      });

       if (cellError) {
        console.error("Failed to set client value on new Client 360 item:", cellError);
      }
    }

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "record.create:after",
      timestamp: new Date().toISOString(),
      actorUserId: "system",
      scope,
      before: null,
      after: afterData,
      metadata: { entityId: recordId },
    } as DomainEventPayload);

    return { data: { recordId, boardId: input.boardId }, error: null, status: 200 };
  } catch (err) {
    console.error("Failed to create Client 360 item:", err);
    return { data: null, error: "Failed to create item", status: 500 };
  }
}

/**
 * Fetch the aggregated pending-work view for the Pending Work sub-tab.
 *
 * Parameters:
 *  - date_field: "any" | "received" | "due"
 *  - start / end: ISO date strings for the active range (ignored when
 *    date_field === "any")
 *  - client_id: optional canonical client id
 *  - client_search: optional free-text fallback for clients not yet resolved
 *  - page / page_size: pagination
 */
export async function fetchClient360PendingWorkAction(options: {
  date_field?: string;
  start?: string;
  end?: string;
  client_id?: string;
  client_search?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<{ data: Client360PendingWorkResult | null; error: string | null; status: number }> {
  try {
    const params = new URLSearchParams();
    if (options.date_field && options.date_field !== "any") {
      params.set("date_field", options.date_field);
    }
    if (options.start) params.set("start", options.start);
    if (options.end) params.set("end", options.end);
    if (options.client_id) params.set("client_id", options.client_id);
    if (options.client_search) params.set("client_search", options.client_search);
    if (options.page) params.set("page", String(options.page));
    if (options.page_size) params.set("page_size", String(options.page_size));

    const qs = params.toString();
    const url = qs
      ? await buildAbsoluteUrl(`/api/client-360/pending?${qs}`)
      : await buildAbsoluteUrl("/api/client-360/pending");

    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { data: null, error: (body as { error?: string }).error ?? "Failed to fetch pending work", status: res.status };
    }

    const data = (await res.json()) as Client360PendingWorkResult;
    return { data, error: null, status: 200 };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("Client 360 pending work fetch failed:", err);
    return { data: null, error: `Failed to fetch pending work data: ${reason}`, status: 500 };
  }
}

/**
 * Fetch resolved clients for the organization, with aliases merged.
 *
 * Each canonical client from `client_360_clients` is returned once, along
 * with its alias texts from `client_360_client_aliases` so the UI can display
 * and filter by near-duplicate name variants (e.g. "Gray & Sons" /
 * "Gray and Sons" collapse into a single entry).
 */
export async function getClient360ResolvedClientsAction(): Promise<{
  data: Client360ResolvedClient[] | null;
  error: string | null;
  status: number;
}> {
  try {
    const organizationId = await getUserOrganizationId();
    if (!organizationId) {
      return { data: null, error: "Unable to determine organization", status: 401 };
    }

    const supabase = await createServiceClient();

    const { data: clients, error: clientsError } = await supabase
      .from("client_360_clients")
      .select("id, canonical_name, needs_confirmation")
      .eq("organization_id", organizationId)
      .order("canonical_name");

    if (clientsError) {
      console.error("Failed to fetch resolved clients:", clientsError);
      return { data: null, error: clientsError.message, status: 500 };
    }

    if (!clients || clients.length === 0) {
      return { data: [], error: null, status: 200 };
    }

    const clientIds = clients.map((c) => c.id);
    const { data: aliases, error: aliasesError } = await supabase
      .from("client_360_client_aliases")
      .select("client_id, alias_text")
      .in("client_id", clientIds)
      .eq("organization_id", organizationId);

    if (aliasesError) {
      console.warn("Failed to fetch client aliases:", aliasesError);
    }

    const aliasesByClient = new Map<string, string[]>();
    for (const a of aliases ?? []) {
      const existing = aliasesByClient.get(a.client_id) ?? [];
      existing.push(a.alias_text);
      aliasesByClient.set(a.client_id, existing);
    }

    const resolved: Client360ResolvedClient[] = clients
      .filter((c) => !c.needs_confirmation)
      .map((c) => ({
      id: c.id,
      canonical_name: c.canonical_name,
      needs_confirmation: c.needs_confirmation,
      aliases: aliasesByClient.get(c.id) ?? [],
      }));

    return { data: resolved, error: null, status: 200 };
  } catch (err) {
    console.error("Failed to fetch resolved clients:", err);
    return { data: null, error: "Failed to fetch clients", status: 500 };
  }
}

export async function getClient360RelationshipClientsAction(): Promise<{
  data: Array<{ id: string; name: string; aliases: string[]; jobs: number; boardCount: number }> | null;
  error: string | null;
  status: number;
  jobsWithoutClient: number;
  possibleDuplicates: Array<{ canonicalName: string; similarTo: string; similarity: number }>;
}> {
  try {
    const result = await getAllClientsFromBoards();
    if (!result.clients || result.clients.length === 0) {
      return { data: [], error: null, status: 200, jobsWithoutClient: result.jobsWithoutClient, possibleDuplicates: result.possibleDuplicates };
    }

    const clients = result.clients
      .map((client) => ({
        id: client.id,
        name: client.displayName,
        aliases: client.aliases,
        jobs: client.jobCount,
        boardCount: client.boardCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      data: clients,
      error: null,
      status: 200,
      jobsWithoutClient: result.jobsWithoutClient,
      possibleDuplicates: result.possibleDuplicates,
    };
  } catch (err) {
    console.error("Failed to fetch relationship clients:", err);
    return { data: null, error: "Failed to fetch clients", status: 500, jobsWithoutClient: 0, possibleDuplicates: [] };
  }
}

export async function logClient360ActivityAction(input: {
  clientId: string;
  type: "email" | "call" | "meeting" | "note";
  title: string;
  summary: string;
  details?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const identity = await getSessionIdentity();
    const organizationId = identity?.organizationId || (await getUserOrganizationId());
    if (!identity || !organizationId) return { ok: false, error: "Not authenticated" };
    if (!input.clientId || !input.title.trim() || !input.summary.trim()) {
      return { ok: false, error: "Activity details are required" };
    }

    const supabase = await createServiceClient();
    const { error } = await supabase.from("activity_logs").insert({
      organization_id: organizationId,
      actor_user_id: identity.userId,
      action: `client.${input.type}`,
      payload: {
        client_id: input.clientId,
        title: input.title.trim(),
        summary: input.summary.trim(),
        details: input.details?.trim() || null,
      },
    });
    if (error) {
      console.error("Failed to persist Client 360 activity:", error.message);
      return { ok: false, error: "Failed to save activity" };
    }
    return { ok: true };
  } catch (error) {
    console.error("Failed to persist Client 360 activity:", error);
    return { ok: false, error: "Failed to save activity" };
  }
}

function paymentTermLabel(days: number | null): string {
  if (days == null) return "Not added";
  if (days === 0) return "Immediate";
  if ([7, 15, 30, 45, 60].includes(days)) return "Net " + days;
  return "Custom";
}

export async function getClient360RelationshipProfileAction(
  clientId: string,
): Promise<{ data: (Client360Profile & { _liveMeta?: { generatedAt: string; unmatchedClients: any[]; aliasConflicts: any[]; boardsWithoutUploadDate: any[]; missingReceivedDateCount: number } }) | null; error: string | null; status: number }> {
  try {
    const organizationId = await getUserOrganizationId();
    if (!organizationId || !clientId) return { data: null, error: "Unable to determine client", status: 400 };
    const supabase = await createServiceClient();
    const { data: clients, error: clientError } = await supabase
      .from("client_360_clients").select("id, canonical_name, needs_confirmation, payment_term_days").eq("organization_id", organizationId);
    if (clientError) throw clientError;
    let requested = (clients ?? []).find((client) => client.id === clientId);
    let virtualClientName: string | null = null;
    if (!requested) {
      virtualClientName = clientId;
      requested = {
        id: clientId,
        canonical_name: clientId,
        needs_confirmation: false,
        payment_term_days: null,
      } as (typeof clients)[number];
    }

    const requestedTermDays =
      typeof requested.payment_term_days === "number" ? (requested.payment_term_days as number) : null;
    const names = virtualClientName ? [virtualClientName] : aliasGroup(requested.canonical_name ?? "");
    const grouped = virtualClientName
      ? []
      : (clients ?? []).filter((client) => names.some((name) => normalizeClient(name) === normalizeClient(client.canonical_name)));
    const ids = new Set(grouped.map((client) => String(client.id)));
    const canonicalName = virtualClientName
      ? toTitleCaseClientName(virtualClientName)
      : (names[names.length - 1] ?? requested.canonical_name);

    const { getLiveJobScope } = await import("./live-job-scope");
    const scope = await getLiveJobScope(organizationId);
    const jobs = virtualClientName
      ? scope.jobs.filter((j) => normalizeClient(j.client_raw ?? "") === normalizeClient(virtualClientName))
      : scope.jobs.filter((j) => j.client_id && ids.has(j.client_id));

    const { data: activityRows, error: activityError } = await supabase
      .from("activity_logs")
      .select("id, action, actor_user_id, payload, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (activityError) console.error("Failed to load Client 360 activity:", activityError.message);
    const persistedTimeline: TimelineActivity[] = (activityRows ?? [])
      .filter((row) => {
        const payload = row.payload as Record<string, unknown> | null;
        return payload?.client_id === requested.id;
      })
      .map((row) => {
        const payload = row.payload as Record<string, unknown>;
        return {
          id: String(row.id),
          type: (String(row.action).replace("client.", "") || "note") as TimelineActivity["type"],
          title: String(payload.title ?? row.action),
          summary: String(payload.summary ?? ""),
          details: typeof payload.details === "string" ? payload.details : undefined,
          author: String(row.actor_user_id ?? "System"),
          timestamp: String(row.created_at),
        };
      });

    const isDone = (j: any) => j.status_class === "completed" && !!j.upload_date;
    const completed = jobs.filter(isDone);
    const pending = jobs.filter((j) => !isDone(j));
    const active = pending;
    const totalSkus = jobs.reduce((sum, j) => sum + (j.sku_count ?? j.image_count ?? 0), 0);

    const identity = await getSessionIdentity();
    const canViewBilling = ["admin", "finance"].includes(identity?.role ?? "");
    const { data: invoiceConfig } = canViewBilling
      ? await supabase.from("client_360_column_config").select("*").eq("organization_id", organizationId)
      : { data: null };

    const deals: DealProject[] = jobs.slice(0, 30).map((j) => {
      const done = isDone(j);
      return { id: j.record_id, name: j.title ?? "Not added", type: "Studio Batch", stage: done ? "Completed" : "In Delivery", value: 0, expectedClose: j.due_date ?? j.received_date ?? "", owner: j.assignee ?? "Not added", probability: done ? 100 : 75, progressPct: done ? 100 : 50, health: done ? "good" : "warning" };
    });
    const timeline: TimelineActivity[] = [
      ...persistedTimeline,
      ...jobs.slice(0, 50).map((j) => ({
      id: j.record_id, type: "deal" as const, title: j.title ?? "Not added",
      summary: String(j.board_name ?? "Not added") + " - " + String(j.status ?? "—"),
      author: j.assignee ?? "Not added", timestamp: j.received_date ?? scope.generatedAt,
      })),
    ];
    const actions: NextBestAction[] = pending.slice(0, 3).map((j) => ({
      id: "live-action-" + j.record_id, priority: "high", category: "Production",
      title: "Review " + String(j.title ?? "Not added"),
      reason: "This job is still marked " + String(j.status ?? "—") + ".", impact: "—",
      dueDate: j.due_date ?? "—", actionLabel: "Review job", actionType: "review",
    }));

    const profile: Client360Profile & { _liveMeta?: any } = {
      id: requested.id, name: canonicalName, legalName: canonicalName, domain: "", industry: "Not added", hqLocation: "Not added", timezone: "Asia/Kolkata",
      accountOwner: { name: "Not added", email: "", role: "Not added" }, lifecycleStage: active.length ? "Active" : "Lead",
      financials: { lifetimeValue: 0, arr: 0, revenueYtd: 0, contractStartDate: "", contractRenewalDate: "", renewalDaysLeft: 0, contractTier: "Production" },
      kpis: { revenueYtd: 0, openDealsCount: active.length, openDealsValue: 0, openTicketsCount: 0, urgentTicketsCount: 0, lastContactDate: "", npsScore: 0, csatScore: 0, totalJobsCount: jobs.length, activeBatchesCount: new Set(active.map((j) => j.batch_id ?? j.record_id)).size, avgTatDays: 0, totalSkusCount: totalSkus, overdueInvoicesCount: 0 },
      nextBestActions: actions, keyContacts: [], dealsAndProjects: deals,
      billing: {
        arr: 0, mrr: 0, lifetimeValue: 0,
        paymentTerms: paymentTermLabel(requestedTermDays) as any,
        customPaymentDays: requestedTermDays != null && ![0, 7, 15, 30, 45, 60].includes(requestedTermDays) ? requestedTermDays : undefined,
        paymentTermDays: requestedTermDays,
        paymentMethod: "—", billingFrequency: "Monthly", currency: "—", invoices: [],
      },
      support: { openTickets: 0, avgFirstResponseHours: 0, avgResolutionDays: 0, tickets: [] }, documents: [], notes: [], timeline, revenueTrend: [],
      recentWins: completed.length ? [String(completed.length) + " jobs completed"] : [], recentIssues: pending.length ? [String(pending.length) + " jobs pending"] : [], assignedTeam: [], tags: [], socialLinks: {},
      dataSources: [{ name: "Live job scope", type: "database", provider: invoiceConfig?.length ? "Configured" : "Not added", status: "synced", lastSyncedText: "Data as of " + new Date(scope.generatedAt).toLocaleString(), lastSyncedIso: scope.generatedAt }],
      canViewBilling,
      _liveMeta: {
        generatedAt: scope.generatedAt,
        unmatchedClients: scope.unmatchedClients,
        aliasConflicts: scope.aliasConflicts,
        boardsWithoutUploadDate: scope.boardsWithoutUploadDate,
        missingReceivedDateCount: scope.missingReceivedDate.length,
      },
    };
    return { data: profile, error: null, status: 200 };
  } catch (error) {
    console.error("Failed to fetch live Client 360 relationship profile:", error);
    return { data: null, error: "Failed to fetch client data", status: 500 };
  }
}
