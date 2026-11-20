export type StatusBucket = "Completed" | "In progress" | "QA" | "Review" | "Overdue" | "Not started" | "Other";

const EXACT: Record<string, StatusBucket> = {
  done: "Completed",
  completed: "Completed",
  complete: "Completed",
  finished: "Completed",
  closed: "Completed",
  resolved: "Completed",
  delivered: "Completed",
  overdue: "Overdue",
  blocked: "Overdue",
  stuck: "Overdue",
  delayed: "Overdue",
  "at risk": "Overdue",
  "at-risk": "Overdue",
  "in progress": "In progress",
  "working on it": "In progress",
  "in-progress": "In progress",
  started: "In progress",
  active: "In progress",
  queued: "In progress",
  inprogress: "In progress",
  "not started": "Not started",
  todo: "Not started",
  "to-do": "Not started",
  backlog: "Not started",
  pending: "Not started",
  "not-started": "Not started",
  open: "Not started",
  qa: "QA",
  review: "Review",
  "in review": "Review",
  "in-qa": "QA",
  testing: "QA",
  "in testing": "QA",
};

export function mapStatus(value: unknown): StatusBucket {
  if (value === null || value === undefined) return "Other";
  const str = String(value).toLowerCase().trim();
  if (EXACT[str]) return EXACT[str];
  if (str.includes("done") || str.includes("complete") || str.includes("delivered") || str === "approved" || str === "closed") return "Completed";
  if (str.includes("progress") || str.includes("working")) return "In progress";
  if (str.includes("qa") || str.includes("testing")) return "QA";
  if (str.includes("review")) return "Review";
  if (str.includes("stuck") || str.includes("block") || str.includes("delay") || str.includes("hold") || str.includes("overdue") || str.includes("at risk")) return "Overdue";
  if (str.includes("todo") || str.includes("backlog") || str.includes("pending") || str.includes("open") || str === "not started") return "Not started";
  return "Other";
}
