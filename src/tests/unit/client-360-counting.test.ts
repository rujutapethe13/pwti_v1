import { describe, it, expect, vi, beforeEach } from "vitest";

import { classifyClientJobs, getJobsDrawer } from "@/features/client-360/card-data";
import type { LiveJobRow } from "@/features/client-360/live-job-scope";

const getUserOrgMock = vi.hoisted(() => vi.fn(() => "org-1"));
vi.mock("@/lib/organization", () => ({
  getUserOrganizationId: getUserOrgMock,
}));

const mockSupabase = { from: vi.fn(() => mockChain) };
const mockChain = {
  select: vi.fn(() => mockChain),
  eq: vi.fn(() => mockChain),
  neq: vi.fn(() => mockChain),
  in: vi.fn(() => mockChain),
  order: vi.fn(() => mockChain),
  limit: vi.fn(() => mockChain),
  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
};
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => mockSupabase,
}));

const getLiveJobScopeMock = vi.hoisted(() => vi.fn());
const resolveClientGroupMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/client-360/live-job-scope", () => ({
  getLiveJobScope: getLiveJobScopeMock,
}));
vi.mock("@/features/client-360/client-group", () => ({
  resolveClientGroup: resolveClientGroupMock,
}));

const hokipoId = "client-hokipo";
const group = { ids: new Set([hokipoId]), paymentTermDays: null, canonicalName: "Hokipo" };

function liveJob(overrides: Partial<LiveJobRow>): LiveJobRow {
  return {
    record_id: "rec",
    board_id: "b1",
    board_name: "Board 1",
    board_slug: null,
    workspace_id: null,
    workspace_name: null,
    group_id: null,
    group_name: null,
    title: "Untitled",
    client_raw: null,
    client_id: null,
    canonical_client_name: null,
    client_display: null,
    client_unmatched: false,
    needs_confirmation: false,
    batch_id: null,
    received_date: null,
    upload_date: null,
    due_date: null,
    status: "Not started",
    status_class: "pending",
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
  } as LiveJobRow;
}

function allBoardIds(rows: LiveJobRow[]): string[] {
  return [...new Set(rows.map((r) => r.board_id))].sort();
}

describe("Client 360 counting — Hokipo across 8 boards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const rows: LiveJobRow[] = [
    // ── Confirmed Client-column rows (7) ──
    // HOKIPO / Hokipo / hokipo are one client; matched case-insensitively.
    liveJob({
      record_id: "r1",
      board_id: "b1",
      board_name: "Board 1",
      client_raw: "Hokipo",
      client_id: hokipoId,
      title: "Hokipo August Job",
      received_date: "2026-08-27",
      upload_date: null,
      status: "In progress",
    }), // August row with NO upload date — must still count
    liveJob({
      record_id: "r2",
      board_id: "b2",
      board_name: "Board 2",
      client_raw: "hokipo",
      client_id: hokipoId,
      title: "Hokipo September Job",
      received_date: "2026-09-01",
      status: "In progress",
    }),
    liveJob({
      record_id: "r3",
      board_id: "b3",
      board_name: "Board 3",
      client_raw: "HOKIPO",
      client_id: hokipoId,
      title: "Hokipo Order",
      received_date: "2026-09-10",
      upload_date: "2026-09-12",
      status: "Done",
    }),
    liveJob({
      record_id: "r4",
      board_id: "b4",
      board_name: "Board 4",
      client_raw: " Hokipo ",
      client_id: hokipoId,
      title: "Job",
      received_date: "2026-09-15",
      status: "Not started",
    }),
    liveJob({
      record_id: "r5",
      board_id: "b5",
      board_name: "Board 5",
      client_raw: "Hokipo",
      client_id: hokipoId,
      title: "Job",
      received_date: "2026-09-20",
      status: "In progress",
    }),
    liveJob({
      record_id: "r6",
      board_id: "b6",
      board_name: "Board 6",
      client_raw: "Hokipo",
      client_id: hokipoId,
      title: "Job",
      received_date: "2026-09-25",
      upload_date: "2026-09-27",
      status: "Done",
    }),
    liveJob({
      record_id: "r7",
      board_id: "b7",
      board_name: "Board 7",
      client_raw: "Hokipo",
      client_id: hokipoId,
      title: "Job",
      received_date: "2026-09-28",
      status: "Not started",
    }),
    // ── Needs-review rows (blank Client, matched elsewhere) ──
    // September ×2
    liveJob({
      record_id: "r8",
      board_id: "b8",
      board_name: "Board 8",
      client_raw: null,
      client_id: null,
      title: "Hokipo Sept Job A",
      received_date: "2026-09-10",
      status: "Not started",
    }), // matched in Job name
    liveJob({
      record_id: "r9",
      board_id: "b1",
      board_name: "Board 1",
      client_raw: null,
      client_id: null,
      title: "Sept Follow-up",
      batch_id: "HOKIPO-SEPT-02",
      received_date: "2026-09-20",
      status: "Not started",
    }), // matched in Batch
    // October ×2 (one carries batch PFM1_4732)
    liveJob({
      record_id: "r10",
      board_id: "b2",
      board_name: "Board 2",
      client_raw: null,
      client_id: null,
      title: "Hokipo PFM1_4732",
      batch_id: "PFM1_4732",
      received_date: "2026-10-09",
      status: "Not started",
    }), // matched in Job name
    liveJob({
      record_id: "r11",
      board_id: "b3",
      board_name: "Board 3",
      client_raw: null,
      client_id: null,
      title: "Hokipo Oct Order",
      received_date: "2026-10-25",
      status: "Not started",
    }), // matched in Job name
  ];

  it("classifies all 11 rows: 7 counted, 4 needs review, none lost or unexplained", async () => {
    const result = await classifyClientJobs(rows, hokipoId, group);

    expect(result.counted.map((j) => j.record_id).sort()).toEqual(["r1", "r2", "r3", "r4", "r5", "r6", "r7"]);
    expect(result.needsReview.map((n) => n.job.record_id).sort()).toEqual(["r8", "r9", "r10", "r11"].slice().sort());
    expect(result.notCounted).toEqual([]);

    // No row is dropped for a missing date: the August row (r1) has no upload date.
    expect(result.counted.find((j) => j.record_id === "r1")).toBeDefined();
    expect((result.counted.find((j) => j.record_id === "r1") as any).upload_date).toBeNull();

    // Every needs-review row names the matched column.
    const byRecord = new Map(result.needsReview.map((n) => [n.job.record_id, n.matchedVia]));
    expect(byRecord.get("r8")).toBe("Job name");
    expect(byRecord.get("r9")).toBe("Batch");
    expect(byRecord.get("r10")).toBe("Job name");
    expect(byRecord.get("r11")).toBe("Job name");
  });

  it("reports all 8 boards (September + October needs-review boards included)", async () => {
    const result = await classifyClientJobs(rows, hokipoId, group);
    const boards = new Set([
      ...result.counted.map((j) => j.board_id),
      ...result.needsReview.map((n) => n.job.board_id),
    ]);
    expect(boards.size).toBe(8);
    expect(allBoardIds(rows).length).toBe(8);
  });

  it("keeps September and October blank-client rows consistent (both needs review, neither counted)", async () => {
    const result = await classifyClientJobs(rows, hokipoId, group);
    const sept = result.needsReview.filter((n) => n.job.received_date!.startsWith("2026-09"));
    const oct = result.needsReview.filter((n) => n.job.received_date!.startsWith("2026-10"));
    expect(sept.length).toBe(2);
    expect(oct.length).toBe(2);
    expect(result.counted.some((j) => ["r8", "r9", "r10", "r11"].includes(j.record_id))).toBe(false);
  });
});

describe("Client 360 drawer totals — Hokipo", () => {
  const scopeJobs = [
    liveJob({ record_id: "r1", board_id: "b1", board_name: "Board 1", client_raw: "Hokipo", client_id: hokipoId, title: "Job", received_date: "2026-09-01", status: "In progress" }),
    liveJob({ record_id: "r2", board_id: "b2", board_name: "Board 2", client_raw: "Hokipo", client_id: hokipoId, title: "Job", received_date: "2026-09-02", status: "Done", upload_date: "2026-09-03" }),
    liveJob({ record_id: "r3", board_id: "b3", board_name: "Board 3", client_raw: "Hokipo", client_id: hokipoId, title: "Job", received_date: "2026-09-03", status: "Not started" }),
    liveJob({ record_id: "r4", board_id: "b4", board_name: "Board 4", client_raw: "Hokipo", client_id: hokipoId, title: "Job", received_date: "2026-09-04", status: "In progress" }),
    liveJob({ record_id: "r5", board_id: "b5", board_name: "Board 5", client_raw: "Hokipo", client_id: hokipoId, title: "Job", received_date: "2026-09-05", status: "Not started" }),
    liveJob({ record_id: "r6", board_id: "b6", board_name: "Board 6", client_raw: "Hokipo", client_id: hokipoId, title: "Job", received_date: "2026-09-06", status: "Done", upload_date: "2026-09-07" }),
    liveJob({ record_id: "r7", board_id: "b7", board_name: "Board 7", client_raw: "Hokipo", client_id: hokipoId, title: "Job", received_date: "2026-09-07", status: "In progress" }),
    // needs-review row on an 8th board: blank client, matched via title
    liveJob({ record_id: "r8", board_id: "b8", board_name: "Board 8", client_raw: null, client_id: null, title: "Hokipo Board 8 Job", received_date: "2026-09-08", status: "Not started" }),
  ];

  it("reports 8 boards and 7 total jobs with needs-review exposed", async () => {
    getLiveJobScopeMock.mockResolvedValue({
      jobs: scopeJobs,
      skippedBoards: [],
      unmatchedClients: [],
      generatedAt: new Date().toISOString(),
    } as any);
    resolveClientGroupMock.mockResolvedValue(group);

    const result = (await getJobsDrawer(hokipoId)) as any;
    expect(result.error).toBeNull();
    expect(result.data?.total).toBe(7); // needs-review not counted in totals
    expect(result.data?.boards).toBe(8); // all boards with Hokipo rows reported
    expect(result.needsReview.length).toBe(1);
    expect(result.skippedBoards).toEqual([]);
  });
});
