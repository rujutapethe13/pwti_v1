"use server";

import { buildAbsoluteUrl } from "@/lib/url";
import type { Client360SearchResult, Client360Filters, Client360PendingWorkResult, Client360ResolvedClient } from "./types";
import { isClientColumn } from "./constants";
import { searchClient360 } from "./search-service";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/organization";
import { eventBus } from "@/features/boards/engine/events";
import type { DomainEventPayload } from "@/features/boards/engine/events";
import type { PermissionScope } from "@/features/boards/engine/types";

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

    const resolved: Client360ResolvedClient[] = clients.map((c) => ({
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
