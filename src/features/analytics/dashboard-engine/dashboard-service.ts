/**
 * Dashboard Service
 *
 * Business logic for Dashboard operations.
 * Follows the same pattern as BoardService in the existing engine.
 *
 * [ASSUMPTION] EventBus, QueryService, metadataCache are consumed
 * through the contracts defined in @/lib/analytics/contracts.
 */

import "server-only";

import { DashboardRepository } from "./dashboard-repository";
import type { ApiResponse } from "@/types";
import type {
  Dashboard,
  DashboardLayout,
  DashboardSettings,
  WidgetInstance,
} from "./types";

const dashboardRepo = new DashboardRepository();

export const DashboardService = {
  // ── Dashboard CRUD ───────────────────────────────────────

  async create(
    data: {
      workspaceId: string;
      name: string;
      description?: string;
      icon?: string;
      color?: string;
    },
  ): Promise<ApiResponse<Dashboard>> {
    const now = new Date().toISOString();
    const dashboard: Dashboard = {
      id: crypto.randomUUID(),
      workspaceId: data.workspaceId,
      name: data.name,
      description: data.description,
      icon: data.icon,
      color: data.color,
      layout: dashboardRepo.defaultLayout(),
      settings: dashboardRepo.defaultSettings(),
      isDefault: false,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    };

    return dashboardRepo.create(dashboard);
  },

  async update(
    id: string,
    updates: Partial<Pick<Dashboard, "name" | "description" | "icon" | "color">>,
  ): Promise<ApiResponse<Dashboard>> {
    return dashboardRepo.update(id, updates as Partial<Dashboard>);
  },

  async duplicate(id: string): Promise<ApiResponse<Dashboard>> {
    const existing = await dashboardRepo.findById(id);
    if (!existing.data) {
      return { data: null, error: "Dashboard not found", status: 404 };
    }

    const now = new Date().toISOString();
    const copy: Dashboard = {
      ...existing.data,
      id: crypto.randomUUID(),
      name: `${existing.data.name} (Copy)`,
      isDefault: false,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    };

    return dashboardRepo.create(copy);
  },

  async delete(id: string): Promise<ApiResponse<null>> {
    return dashboardRepo.hardDelete(id);
  },

  async toggleFavorite(id: string): Promise<ApiResponse<Dashboard>> {
    const existing = await dashboardRepo.findById(id);
    if (!existing.data) {
      return { data: null, error: "Dashboard not found", status: 404 };
    }
    return dashboardRepo.toggleFavorite(id, !existing.data.isFavorite);
  },

  // ── Query ────────────────────────────────────────────────

  async findByWorkspace(workspaceId: string): Promise<ApiResponse<Dashboard[]>> {
    return dashboardRepo.findByWorkspace(workspaceId);
  },

  async findById(id: string): Promise<ApiResponse<Dashboard>> {
    return dashboardRepo.findById(id);
  },

  // ── Layout ───────────────────────────────────────────────

  async updateLayout(
    id: string,
    layout: DashboardLayout,
  ): Promise<ApiResponse<Dashboard>> {
    return dashboardRepo.updateLayout(id, layout);
  },

  // ── Settings ─────────────────────────────────────────────

  async updateSettings(
    id: string,
    settings: Partial<DashboardSettings>,
  ): Promise<ApiResponse<Dashboard>> {
    return dashboardRepo.updateSettings(id, settings);
  },
};

/**
 * WidgetInstance operations (stored as part of dashboard layout).
 * Widget instances are identified by their GridItem.i in the layout.
 *
 * [ASSUMPTION] Widget configs are stored separately in a `widgets` table
 * or embedded in the dashboard metadata. This implementation stores them
 * in-memory via a Map. Reconcile with actual persistence strategy.
 */
const widgetStore = new Map<string, Map<string, WidgetInstance>>();

export const WidgetService = {
  async createWidget(
    dashboardId: string,
    data: {
      type: string;
      title: string;
      config: Record<string, unknown>;
      boardId?: string;
    },
  ): Promise<ApiResponse<WidgetInstance>> {
    const now = new Date().toISOString();
    const widget: WidgetInstance = {
      id: crypto.randomUUID(),
      dashboardId,
      type: data.type,
      title: data.title,
      config: data.config,
      boardId: data.boardId,
      position: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (!widgetStore.has(dashboardId)) {
      widgetStore.set(dashboardId, new Map());
    }
    widgetStore.get(dashboardId)!.set(widget.id, widget);

    return { data: widget, error: null, status: 201 };
  },

  async updateWidget(
    dashboardId: string,
    widgetId: string,
    updates: Partial<Pick<WidgetInstance, "title" | "config" | "boardId">>,
  ): Promise<ApiResponse<WidgetInstance>> {
    const dashboardWidgets = widgetStore.get(dashboardId);
    const existing = dashboardWidgets?.get(widgetId);
    if (!existing) {
      return { data: null, error: "Widget not found", status: 404 };
    }

    const updated: WidgetInstance = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    dashboardWidgets!.set(widgetId, updated);
    return { data: updated, error: null, status: 200 };
  },

  async deleteWidget(
    dashboardId: string,
    widgetId: string,
  ): Promise<ApiResponse<null>> {
    const dashboardWidgets = widgetStore.get(dashboardId);
    if (!dashboardWidgets?.has(widgetId)) {
      return { data: null, error: "Widget not found", status: 404 };
    }

    dashboardWidgets.delete(widgetId);
    return { data: null, error: null, status: 200 };
  },

  async getWidgets(dashboardId: string): Promise<ApiResponse<WidgetInstance[]>> {
    const dashboardWidgets = widgetStore.get(dashboardId);
    if (!dashboardWidgets) {
      return { data: [], error: null, status: 200 };
    }
    return {
      data: Array.from(dashboardWidgets.values()),
      error: null,
      status: 200,
    };
  },

  async getWidget(
    dashboardId: string,
    widgetId: string,
  ): Promise<ApiResponse<WidgetInstance>> {
    const dashboardWidgets = widgetStore.get(dashboardId);
    const widget = dashboardWidgets?.get(widgetId);
    if (!widget) {
      return { data: null, error: "Widget not found", status: 404 };
    }
    return { data: widget, error: null, status: 200 };
  },
};
