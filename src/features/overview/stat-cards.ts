/**
 * Stat cards for the Overview page.
 *
 * Every number here is a real aggregate produced by `overview_period_stats()`
 * in the database. Every trend is a comparison against the immediately
 * preceding window of the same length, which is also a real query. There is no
 * fabricated percentage anywhere: when the prior window cannot produce a
 * meaningful baseline, the trend reports "unavailable" instead of inventing one.
 */

import {
  EMPTY_COVERAGE,
  type RangeCoverage,
} from "@/features/overview/time-range";

/** A client identity as returned by the aggregation. */
export interface BusiestClient {
  clientId: string;
  /** Canonical client name, or null when the name is missing in the DB. */
  name: string | null;
  /** Jobs received by this client in the window. */
  count: number;
}

/** All aggregates for a single window, as returned by the SQL aggregation. */
export interface PeriodAggregate {
  /** Records whose received date falls in the window. */
  recordsInWindow: number;
  jobsReceived: number;
  clientsActive: number;
  boardsTouched: number;
  /** Received in the window *and* currently carrying a completed status. */
  completedByStatus: number;
  /** Records whose completion date falls in the window. */
  jobsCompleted: number;
  receivedTimestamps: number;
  completedTimestamps: number;
  /** Received in the window that carry both a received and a completion date. */
  turnaroundSample: number;
  /** Mean completed_date - job_date over `turnaroundSample`, in days. */
  turnaroundAvgDays: number | null;
  /** True when at least one board in the org maps a real completion-date column. */
  completedDateAvailable: boolean;
  busiestClient: BusiestClient | null;
}

/** Aggregates for the selected window plus its immediately preceding window. */
export interface PeriodComparison {
  current: PeriodAggregate;
  prior: PeriodAggregate;
  /** Jobs the current busiest client received in the prior window. */
  currentTopClientPriorCount: number;
}

export type TrendDirection = "up" | "down" | "flat" | "unavailable";

export type TrendSentiment = "good" | "bad" | "neutral";

export interface StatTrend {
  direction: TrendDirection;
  /**
   * A sentence describing the real comparison, e.g.
   * "12 vs 9 in the prior 7 days". This is what the card renders; it is never
   * assembled from a guessed value.
   */
  label: string;
  previousValue: number | null;
  /**
   * Percent change, or null when the prior window has no baseline to divide by.
   * A prior value of 0 yields null, not 0% and not 100%.
   */
  percentChange: number | null;
  absoluteChange: number | null;
  sentiment: TrendSentiment;
}

export type StatCardId =
  | "jobsReceived"
  | "jobsCompleted"
  | "clientsActive"
  | "boardsTouched"
  | "busiestClient"
  | "avgTurnaround";

export interface StatCard {
  id: StatCardId;
  label: string;
  /** Rendered value. Empty when the metric is unavailable. */
  value: string;
  /** True when the DB cannot support the metric. Never a placeholder number. */
  unavailable: boolean;
  /** Why the metric is missing. Only present when `unavailable` is true. */
  unavailableReason?: string;
  /** The definition behind the number, so it is never ambiguous. */
  caption: string;
  /** Optional secondary line, e.g. the busiest client's name. */
  detail?: string;
  trend: StatTrend;
}

export interface StatCardsResult {
  cards: StatCard[];
  /** True when the window holds no records at all. */
  isEmpty: boolean;
  range: {
    id: string;
    label: string;
    from: string;
    to: string;
    days: number;
    priorFrom: string;
    priorTo: string;
  };
  /**
   * How the workspace's records sit relative to this window. Lets the empty
   * state say "N items exist outside this range" instead of implying the
   * workspace is empty.
   */
  coverage: RangeCoverage;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatDays(value: number): string {
  return `${value.toFixed(1)}d`;
}

function pluralize(count: number, singular: string): string {
  return `${formatCount(count)} ${singular}${count === 1 ? "" : "s"}`;
}

export interface CountTrendOptions {
  /** Whether a decrease is a good outcome (true for turnaround). */
  lowerIsBetter?: boolean;
  /** Length of the period in days, used in the sentence. */
  days: number;
  /** Set when the prior value is structurally unavailable rather than zero. */
  priorUnavailableReason?: string;
}

/**
 * Builds a trend from two real measurements.
 *
 * A prior value of 0 produces a real "0 in the prior N days" comparison with
 * `percentChange: null` — the ratio is undefined there, so no percentage is
 * reported rather than a fabricated 0% or 100%.
 */
export function buildCountTrend(
  current: number,
  prior: number | null,
  options: CountTrendOptions,
): StatTrend {
  const { days, lowerIsBetter = false } = options;
  const periodLabel = `prior ${formatCount(days)} ${days === 1 ? "day" : "days"}`;

  if (prior === null) {
    return {
      direction: "unavailable",
      label: options.priorUnavailableReason ?? "No prior-period data to compare",
      previousValue: null,
      percentChange: null,
      absoluteChange: null,
      sentiment: "neutral",
    };
  }

  const direction: TrendDirection =
    current > prior ? "up" : current < prior ? "down" : "flat";

  const percentChange = prior === 0 ? null : ((current - prior) / prior) * 100;
  const absoluteChange = current - prior;

  let sentiment: TrendSentiment = "neutral";
  if (direction === "up" || direction === "down") {
    const improved = lowerIsBetter ? direction === "down" : direction === "up";
    sentiment = improved ? "good" : "bad";
  }

  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  const counts = `${formatCount(current)} vs ${formatCount(prior)} in the ${periodLabel}`;
  const label = direction === "flat" ? counts : `${arrow} ${counts}`;

  return {
    direction,
    label,
    previousValue: prior,
    percentChange,
    absoluteChange,
    sentiment,
  };
}

function unavailableTrend(reason: string): StatTrend {
  return {
    direction: "unavailable",
    label: reason,
    previousValue: null,
    percentChange: null,
    absoluteChange: null,
    sentiment: "neutral",
  };
}

export const NO_COMPLETED_DATE_REASON =
  "No completion-date column is mapped on any board, so completion timestamps do not exist and turnaround cannot be measured.";

const NO_TURNAROUND_SAMPLE_REASON =
  "No job in this period has both a received and a completion date.";

const NO_PRIOR_TURNAROUND_REASON =
  "No job in the prior period has both dates, so there is nothing to compare against.";

/**
 * Assembles the six Overview stat cards from two real windows of aggregates.
 *
 * Definitions, in each case, are stated on the card itself so a number is never
 * left ambiguous:
 *  - Jobs received   : records whose received date is in the window.
 *  - Jobs completed  : records whose *completion date* is in the window. Only when
 *                      no board maps a completion date does this fall back to
 *                      counting completed-status jobs received in the window —
 *                      and the card then says so explicitly.
 *  - Clients active  : distinct clients with a job received in the window.
 *  - Boards touched  : distinct boards with a job received in the window.
 *  - Busiest client  : the client with the most jobs received in the window,
 *                      trended against the same client's prior-window count.
 *  - Avg. turnaround : mean completion_date - received_date over jobs that have
 *                      both. Skipped, with a reason, when they do not.
 */
export function buildStatCards(
  comparison: PeriodComparison,
  range: StatCardsResult["range"],
  coverage: RangeCoverage = EMPTY_COVERAGE,
): StatCardsResult {
  const { current, prior, currentTopClientPriorCount } = comparison;
  const { days } = range;

  const jobsReceived: StatCard = {
    id: "jobsReceived",
    label: "Jobs received",
    value: formatCount(current.jobsReceived),
    unavailable: false,
    caption: "Jobs with a received date in this period",
    trend: buildCountTrend(current.jobsReceived, prior.jobsReceived, { days }),
  };

  const usesCompletionDates = current.completedDateAvailable;
  const jobsCompletedValue = usesCompletionDates
    ? current.jobsCompleted
    : current.completedByStatus;
  const jobsCompleted: StatCard = {
    id: "jobsCompleted",
    label: "Jobs completed",
    value: formatCount(jobsCompletedValue),
    unavailable: false,
    caption: usesCompletionDates
      ? "Jobs with a completion date in this period"
      : "Received in this period with a completed status (no completion dates exist)",
    trend: buildCountTrend(
      jobsCompletedValue,
      usesCompletionDates ? prior.jobsCompleted : prior.completedByStatus,
      { days },
    ),
  };

  const clientsActive: StatCard = {
    id: "clientsActive",
    label: "Clients active",
    value: formatCount(current.clientsActive),
    unavailable: false,
    caption: "Distinct clients with a job received in this period",
    trend: buildCountTrend(current.clientsActive, prior.clientsActive, { days }),
  };

  const boardsTouched: StatCard = {
    id: "boardsTouched",
    label: "Boards touched",
    value: formatCount(current.boardsTouched),
    unavailable: false,
    caption: "Distinct boards with a job received in this period",
    trend: buildCountTrend(current.boardsTouched, prior.boardsTouched, { days }),
  };

  const busiestClient: StatCard = current.busiestClient
    ? {
        id: "busiestClient",
        label: "Busiest client",
        value: formatCount(current.busiestClient.count),
        unavailable: false,
        detail: current.busiestClient.name ?? `Client ${current.busiestClient.clientId.slice(0, 8)}`,
        caption: `Most jobs received by one client · ${current.busiestClient.name ?? "unnamed client"}`,
        trend: buildCountTrend(
          current.busiestClient.count,
          currentTopClientPriorCount,
          { days },
        ),
      }
    : {
        id: "busiestClient",
        label: "Busiest client",
        value: "",
        unavailable: true,
        unavailableReason: "No job in this period is attributed to a client.",
        caption: "Most jobs received by one client",
        trend: unavailableTrend("No prior-period client data to compare"),
      };

  let avgTurnaround: StatCard;
  if (!usesCompletionDates) {
    avgTurnaround = {
      id: "avgTurnaround",
      label: "Avg. turnaround",
      value: "",
      unavailable: true,
      unavailableReason: NO_COMPLETED_DATE_REASON,
      caption: "Time from received to completed",
      trend: unavailableTrend("Turnaround not measurable"),
    };
  } else if (current.turnaroundSample === 0 || current.turnaroundAvgDays === null) {
    avgTurnaround = {
      id: "avgTurnaround",
      label: "Avg. turnaround",
      value: "",
      unavailable: true,
      unavailableReason: NO_TURNAROUND_SAMPLE_REASON,
      caption: "Time from received to completed",
      trend: unavailableTrend("No comparable data in the prior period"),
    };
  } else {
    const hasPriorSample = prior.turnaroundSample > 0 && prior.turnaroundAvgDays !== null;
    avgTurnaround = {
      id: "avgTurnaround",
      label: "Avg. turnaround",
      value: formatDays(current.turnaroundAvgDays),
      unavailable: false,
      caption: `Received → completed, across ${pluralize(current.turnaroundSample, "job")}`,
      trend: hasPriorSample
        ? buildCountTrend(
            Number(current.turnaroundAvgDays.toFixed(2)),
            Number(prior.turnaroundAvgDays!.toFixed(2)),
            { days, lowerIsBetter: true },
          )
        : {
            ...unavailableTrend(NO_PRIOR_TURNAROUND_REASON),
            previousValue: null,
          },
    };
  }

  const cards = [
    jobsReceived,
    jobsCompleted,
    clientsActive,
    boardsTouched,
    busiestClient,
    avgTurnaround,
  ];

  return {
    cards,
    isEmpty: current.recordsInWindow === 0,
    range,
    coverage,
  };
}
