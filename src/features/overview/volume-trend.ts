/**
 * Volume trend — pure transform from two bucket series to chart-ready points.
 *
 * The Overview Volume chart used to be a single bar series ("jobs received") fed
 * by `accumulateVolume`. This module generalizes it to two independent series —
 * received and completed — so the chart can show both at once and let the user
 * switch between them. It is deliberately free of Supabase, React and Recharts:
 * every function here is a pure mapping over `VolumeBucket[]`, which keeps it
 * unit-testable without a database.
 */

import {
  type VolumeBucket,
  type VolumeGranularity,
  type VolumeTrendPoint,
  mergeVolumeBuckets,
} from "@/features/overview/volume-buckets";
import { type RangeCoverage } from "@/features/overview/time-range";

/** Which metric the chart is rendering. */
export type VolumeMetric = "received" | "completed";

/** Shape the API returns: two bucket series plus the range metadata. */
export interface VolumeTrendPayload {
  range: {
    id: string;
    label: string;
    from: string;
    to: string;
    days: number;
    granularity: VolumeGranularity;
    today: string | null;
  };
  /** Zero-filled buckets for jobs received in the window. */
  received: VolumeBucket[];
  /** Zero-filled buckets for jobs completed in the window. */
  completed: VolumeBucket[];
  /** True when at least one board maps a real completion-date column. */
  completedDateAvailable: boolean;
  /**
   * How the workspace's records sit relative to this window, so an empty chart
   * can report that data exists outside the selected range.
   */
  coverage: RangeCoverage;
}

/** Result of projecting a payload into chart points. */
export interface VolumeTrendResult {
  points: VolumeTrendPoint[];
  todayKey: string | null;
  completedDateAvailable: boolean;
  metric: VolumeMetric;
  granularity: VolumeGranularity;
  isEmpty: boolean;
}

/**
 * Projects a payload into the points a chart needs, for one metric.
 *
 * When `metric` is `"completed"` and the org has no completion-date column,
 * the caller should not ask for it at all — this function still returns a safe
 * empty result rather than inventing completions.
 */
export function toVolumeTrendPoints(
  payload: VolumeTrendPayload,
  metric: VolumeMetric,
): VolumeTrendResult {
  const points = mergeVolumeBuckets(payload.received, payload.completed);
  return {
    points,
    todayKey: payload.range.today,
    completedDateAvailable: payload.completedDateAvailable,
    metric,
    granularity: payload.range.granularity,
    isEmpty: points.every((p) => p.received === 0 && p.completed === 0),
  };
}
