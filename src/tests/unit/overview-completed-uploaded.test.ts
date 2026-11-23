import { describe, expect, it } from "vitest";

import { completedUploadedJobs, type LiveJobRow } from "@/features/client-360/live-job-scope";

const job = (overrides: Partial<LiveJobRow>): LiveJobRow => ({
  record_id: "rec-1",
  board_id: "board-1",
  board_name: "Board 1",
  board_slug: null,
  workspace_id: null,
  workspace_name: null,
  group_id: null,
  group_name: null,
  title: "Job",
  client_raw: null,
  client_id: null,
  canonical_client_name: null,
  client_display: null,
  client_unmatched: false,
  needs_confirmation: false,
  batch_id: null,
  received_date: "2026-10-01",
  upload_date: "2026-10-05",
  due_date: null,
  status: "done",
  status_class: "completed",
  sku_count: null,
  image_count: null,
  assignee: null,
  invoice_amount_masked: null,
  invoice_status: null,
  job_type: null,
  received_column: null,
  client_column: null,
  upload_column: null,
  ...overrides,
});

describe("completedUploadedJobs (shared Completed (Uploaded) selector)", () => {
  const from = "2026-10-21";
  const to = "2026-11-19";

  it("returns exactly the unique jobs with an upload date in the window, regardless of status", () => {
    const inRange = Array.from({ length: 10 }, (_, i) =>
      job({
        record_id: `rec-in-${i}`,
        upload_date: "2026-11-01",
        status_class: "completed",
      }),
    );

    const jobs: LiveJobRow[] = [
      // 10 completed jobs with upload date inside the window -> all count
      ...inRange,
      // duplicate record_id of an in-range completed job -> deduped, not double counted
      job({ record_id: "rec-in-0", upload_date: "2026-11-01", status_class: "completed" }),
      // upload date outside the window -> excluded, even though completed
      job({ record_id: "rec-out", upload_date: "2026-09-01", status_class: "completed" }),
      // upload date in the window but not completed -> counts (upload date is the source of truth)
      job({ record_id: "rec-pending", upload_date: "2026-11-01", status_class: "pending" }),
      // completed but no upload date -> excluded
      job({ record_id: "rec-noupload", upload_date: null, status_class: "completed" }),
      // completed but upload date outside the window -> excluded
      job({
        record_id: "rec-board2",
        board_id: "board-2",
        board_name: "Board 2",
        upload_date: "2026-12-01",
        status_class: "completed",
      }),
    ];

    const result = completedUploadedJobs(jobs, from, to);

    expect(result).toHaveLength(11);
    expect(new Set(result.map((j) => j.record_id)).size).toBe(11);
    expect(result.every((j) => j.upload_date! >= from && j.upload_date! <= to)).toBe(true);
    expect(result.some((j) => j.record_id === "rec-pending")).toBe(true);
    expect(result.every((j) => j.record_id !== "rec-out")).toBe(true);
    expect(result.every((j) => j.record_id !== "rec-noupload")).toBe(true);
    expect(result.every((j) => j.record_id !== "rec-board2")).toBe(true);
  });

  it("returns an empty list when nothing has an upload date in range", () => {
    const jobs: LiveJobRow[] = [
      job({ record_id: "rec-1", upload_date: "2026-09-01", status_class: "completed" }),
      job({ record_id: "rec-2", upload_date: null, status_class: "completed" }),
      job({ record_id: "rec-3", upload_date: "2026-12-01", status_class: "pending" }),
    ];
    expect(completedUploadedJobs(jobs, from, to)).toEqual([]);
  });
});
