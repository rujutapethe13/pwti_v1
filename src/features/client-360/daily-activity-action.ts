"use server";

import { fetchClient360DailyActivity } from "./daily-activity-service";
import type { Client360DailyActivity } from "./types";
import { fetchActivity } from "./daily-activity-service";
import type { ActivityData, ActivityMode } from "./types";

export async function fetchActivityAction(options: {
  selectedDate?: string;
  mode?: ActivityMode;
  onlyMine?: boolean;
} = {}): Promise<{ data: ActivityData | null; error: string | null; status: number }> {
  try {
    return { data: await fetchActivity(options), error: null, status: 200 };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("Activity fetch failed:", err);
    return { data: null, error: `Failed to fetch activity data: ${reason}`, status: 500 };
  }
}

export async function fetchClient360DailyActivityAction(
  options: { selectedDate?: string; clientId?: string } = {},
): Promise<{ data: Client360DailyActivity | null; error: string | null; status: number }> {
  try {
    const data = await fetchClient360DailyActivity({
      selectedDate: options.selectedDate,
      clientId: options.clientId,
    });

    return { data, error: null, status: 200 };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("Client 360 daily activity fetch failed:", err);
    return {
      data: null,
      error: `Failed to fetch daily activity data: ${reason}`,
      status: 500,
    };
  }
}

export async function fetchActivityTasksAction(options: {
  selectedDate?: string;
  mode?: ActivityMode;
  workspaceIds?: string[];
  boardIds?: string[];
  onlyMine?: boolean;
} = {}): Promise<{ data: ActivityTasksResponse | null; error: string | null; status: number }> {
  try {
    const data = await fetchActivityTasks(options);
    return { data, error: null, status: 200 };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("Activity tasks fetch failed:", err);
    return {
      data: null,
      error: `Failed to fetch activity tasks: ${reason}`,
      status: 500,
    };
  }
}

