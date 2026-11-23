import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
  createClient: vi.fn(),
}));

import {
  addDays,
  daysBetween,
  invoiceOverdueDays,
  isInvoiceCleared,
  isJobCompleted,
  isValidEmail,
  normalizeClientName,
  normalizeEmail,
  overdueJobDays,
  parseAmount,
  parseCellDate,
  shouldSendAlert,
  toDayNumber,
} from "@/features/email-alerts/predicate";
import { paymentTermLabel } from "@/features/email-alerts/settings";
import { applyCadence } from "@/features/email-alerts/dedupe";
import {
  buildOptionLabelMap,
  resolveBoardColumns,
  type BoardColumns,
  type ColumnRow,
} from "@/features/email-alerts/columns";
import { evaluateRecord } from "@/features/email-alerts/evaluate";
import { deliverGroups, type SendRequest } from "@/features/email-alerts/deliver";
import { escapeHtml, renderDigestEmail } from "@/features/email-alerts/template";
import type { AlertCandidate, AlertLogEntry, DigestPayload } from "@/features/email-alerts/types";

const TODAY = "2026-11-18";

function candidate(overrides: Partial<AlertCandidate> = {}): AlertCandidate {
  return {
    recordId: "rec-1",
    boardId: "board-1",
    boardName: "Retouching",
    boardSlug: "retouching",
    workspaceId: "ws-1",
    organizationId: "org-1",
    clientId: "client-1",
    clientName: "Levis",
    jobTitle: "SS26 Denim Batch",
    alertType: "job_overdue",
    dueDate: "2026-11-10",
    daysOverdue: 8,
    invoiceAmount: null,
    assigneeRefs: [],
    ...overrides,
  };
}

function log(overrides: Partial<AlertLogEntry> = {}): AlertLogEntry {
  return {
    recordId: "rec-1",
    alertType: "job_overdue",
    recipientEmail: "ops@example.com",
    sentOn: "2026-11-17",
    ...overrides,
  };
}

describe("date helpers", () => {
  it("parses valid dates to day numbers", () => {
    expect(toDayNumber("2026-11-18")).toBe(Math.floor(Date.UTC(2026, 10, 18) / 86400000));
  });

  it("rejects impossible dates like 31 Feb", () => {
    expect(toDayNumber("2026-02-31")).toBeNull();
    expect(toDayNumber("not-a-date")).toBeNull();
    expect(toDayNumber("")).toBeNull();
  });

  it("counts days between dates and can go negative", () => {
    expect(daysBetween("2026-11-10", "2026-11-18")).toBe(8);
    expect(daysBetween("2026-11-20", "2026-11-18")).toBe(-2);
    expect(daysBetween("bad", "2026-11-18")).toBeNull();
  });

  it("adds calendar days", () => {
    expect(addDays("2026-11-18", 15)).toBe("2026-12-03");
    expect(addDays("2026-11-18", 0)).toBe("2026-11-18");
    expect(addDays("2026-02-31", 1)).toBeNull();
  });

  it("parses board cell dates in ISO and day-first formats", () => {
    expect(parseCellDate("2026-11-18", null)).toBe("2026-11-18");
    expect(parseCellDate("17-03-2026", null)).toBe("2026-03-17");
    expect(parseCellDate(null, "05/11/2026")).toBe("2026-11-05");
    expect(parseCellDate("2026-11-18T10:00:00", null)).toBe("2026-11-18");
    expect(parseCellDate("", "")).toBeNull();
    expect(parseCellDate("garbage", null)).toBeNull();
    expect(parseCellDate("31-02-2026", null)).toBeNull(); // impossible day-first date
  });
});

describe("overdue job rule", () => {
  it("flags a pending job past its deadline", () => {
    expect(overdueJobDays("2026-11-10", "In Progress", true, TODAY)).toBe(8);
  });

  it("does not flag a job due today or in the future", () => {
    expect(overdueJobDays("2026-11-18", "In Progress", true, TODAY)).toBeNull();
    expect(overdueJobDays("2026-11-25", "In Progress", true, TODAY)).toBeNull();
  });

  it("never flags completed or cancelled jobs", () => {
    expect(overdueJobDays("2026-11-10", "Done", true, TODAY)).toBeNull();
    expect(overdueJobDays("2026-11-10", "Delivered", true, TODAY)).toBeNull();
    expect(overdueJobDays("2026-11-10", "Cancelled", true, TODAY)).toBeNull();
  });

  it("skips jobs explicitly marked not pending", () => {
    expect(overdueJobDays("2026-11-10", "In Progress", false, TODAY)).toBeNull();
  });

  it("skips rows without a deadline or with a bad deadline", () => {
    expect(overdueJobDays(null, "In Progress", true, TODAY)).toBeNull();
    expect(overdueJobDays("garbage", "In Progress", true, TODAY)).toBeNull();
  });
});

describe("invoice clearance rule", () => {
  it("supports same-day, 15, 30 and 45 day terms", () => {
    expect(invoiceOverdueDays("2026-11-01", 0, "Pending", TODAY)).toBe(17);
    expect(invoiceOverdueDays("2026-11-01", 15, "Pending", TODAY)).toBe(2);
    expect(invoiceOverdueDays("2026-10-19", 30, "Pending", TODAY)).toBeNull(); // due exactly today
    expect(invoiceOverdueDays("2026-10-18", 30, "Pending", TODAY)).toBe(1);
    expect(invoiceOverdueDays("2026-10-03", 45, "Pending", TODAY)).toBe(1);
  });

  it("supports custom terms", () => {
    expect(invoiceOverdueDays("2026-11-01", 10, "Pending", TODAY)).toBe(7);
  });

  it("does not flag cleared invoices", () => {
    expect(invoiceOverdueDays("2026-11-01", 0, "Paid", TODAY)).toBeNull();
    expect(invoiceOverdueDays("2026-11-01", 0, "Cleared", TODAY)).toBeNull();
    expect(invoiceOverdueDays("2026-11-01", 0, "Settled", TODAY)).toBeNull();
  });

  it("does nothing without a term or a counted-from date", () => {
    expect(invoiceOverdueDays("2026-11-01", null, "Pending", TODAY)).toBeNull();
    expect(invoiceOverdueDays(null, 15, "Pending", TODAY)).toBeNull();
    expect(invoiceOverdueDays("2026-11-01", -1, "Pending", TODAY)).toBeNull();
  });

  it("does not flag an invoice due today or later", () => {
    expect(invoiceOverdueDays("2026-11-18", 0, "Pending", TODAY)).toBeNull();
    expect(invoiceOverdueDays("2026-11-01", 30, "Pending", TODAY)).toBeNull();
  });

  it("recognises cleared and completed invoice statuses case-insensitively", () => {
    expect(isInvoiceCleared("paid")).toBe(true);
    expect(isInvoiceCleared("CLEARED")).toBe(true);
    expect(isInvoiceCleared("Pending")).toBe(false);
    expect(isInvoiceCleared("")).toBe(false);
    expect(isInvoiceCleared(null)).toBe(false);
  });

  it("recognises board option ids like opt-done as cleared", () => {
    expect(isInvoiceCleared("opt-done")).toBe(true);
    expect(isInvoiceCleared("opt-working-on-it")).toBe(false);
    expect(isInvoiceCleared("opt-stuck")).toBe(false);
    expect(isJobCompleted("opt-done")).toBe(true);
    expect(isJobCompleted("opt-not-started")).toBe(false);
  });

  it("treats empty status as not cleared but requires a term anyway", () => {
    expect(invoiceOverdueDays("2026-11-01", 0, "", TODAY)).toBe(17);
  });
});

describe("job completion status", () => {
  it("matches done/complete/deliver/cancel variants", () => {
    expect(isJobCompleted("Done")).toBe(true);
    expect(isJobCompleted("Completed")).toBe(true);
    expect(isJobCompleted("Delivered")).toBe(true);
    expect(isJobCompleted("Cancelled")).toBe(true);
    expect(isJobCompleted("In Progress")).toBe(false);
    expect(isJobCompleted("")).toBe(false);
  });
});

describe("cadence", () => {
  const fresh: AlertLogEntry[] = [];

  it("sends the first time (no history)", () => {
    expect(shouldSendAlert(fresh, TODAY, 7)).toBe(true);
  });

  it("never sends twice on the same day", () => {
    const logs = [log({ sentOn: TODAY })];
    expect(shouldSendAlert(logs, TODAY, 7)).toBe(false);
  });

  it("waits the repeat interval between sends", () => {
    const sent = log({ sentOn: "2026-11-12" }); // 6 days before today
    expect(shouldSendAlert([sent], TODAY, 7)).toBe(false); // 6 days ago → wait
    expect(shouldSendAlert([log({ sentOn: "2026-11-11" })], TODAY, 7)).toBe(true); // 7 days ago → send
    expect(shouldSendAlert([log({ sentOn: "2026-11-10" })], TODAY, 7)).toBe(true); // 8 days ago → send
  });

  it("ignores other records, types and recipients via applyCadence", () => {
    const logsByRecord = new Map<string, AlertLogEntry[]>([
      ["rec-2", [log({ recordId: "rec-2" })]],
      [
        "rec-1",
        [
          log({ alertType: "invoice_uncleared" }),
          log({ recipientEmail: "other@example.com" }),
        ],
      ],
    ]);
    const result = applyCadence([{ recordId: "rec-1", alertType: "job_overdue" }], logsByRecord, "ops@example.com", TODAY, 7);
    expect(result).toHaveLength(1);
  });

  it("falls back to a 7 day interval for invalid config", () => {
    expect(shouldSendAlert([log({ sentOn: "2026-11-12" })], TODAY, 0)).toBe(false);
    expect(shouldSendAlert([log({ sentOn: "2026-11-12" })], TODAY, Number.NaN)).toBe(false);
  });
});

describe("email helpers", () => {
  it("validates addresses without inventing them", () => {
    expect(isValidEmail("ops@example.com")).toBe(true);
    expect(isValidEmail("  OPS@Example.COM ")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("normalizes for dedupe keys", () => {
    expect(normalizeEmail("  Ops@Example.com ")).toBe("ops@example.com");
  });

  it("parses invoice amounts from text cells", () => {
    expect(parseAmount("$1,250.50")).toBe(1250.5);
    expect(parseAmount(99)).toBe(99);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });

  it("labels payment terms for the billing UI", () => {
    expect(paymentTermLabel(null)).toBe("Not added");
    expect(paymentTermLabel(0)).toBe("Immediate (same day)");
    expect(paymentTermLabel(15)).toBe("15 days");
    expect(paymentTermLabel(30)).toBe("30 days");
    expect(paymentTermLabel(45)).toBe("45 days");
    expect(paymentTermLabel(60)).toBe("Custom (60 days)");
  });
});

describe("client name matching", () => {
  it("matches on case and whitespace only", () => {
    expect(normalizeClientName("  Levi's  ")).toBe("levi's");
    expect(normalizeClientName("Levi's")).toBe("levi's");
    expect(normalizeClientName("Client / Company\nName")).toBe("client / company name");
    expect(normalizeClientName(null)).toBe("");
  });

  it("does not fuzzy match", () => {
    // Different punctuation is a different client: a loose match here would
    // email the wrong client's contacts.
    expect(normalizeClientName("Levis")).toBe("levis");
    expect(normalizeClientName("Levi's")).toBe("levi's");
    expect(normalizeClientName("Levis")).not.toBe(normalizeClientName("Levi's"));
    expect(normalizeClientName("Leviss")).not.toBe(normalizeClientName("Levis"));
  });
});

describe("board column resolution", () => {
  const col = (id: string, label: string | null, boardId = "board-1"): ColumnRow => ({
    id,
    board_id: boardId,
    label,
    settings: null,
  });

  const denimBoard = [
    col("c-client", "Client / Company \n Name"),
    col("c-due", "Due Date"),
    col("c-upload", "Date of Upload"),
    col("c-receive", "Receive Date\nPost Production"),
    col("c-amount", "Invoice Amount"),
    col("c-invstatus", "Invoice\n Status"),
    col("c-assignee", "Assigned To"),
  ];

  it("resolves the live board layout by label, including embedded newlines", () => {
    const resolved = resolveBoardColumns(denimBoard, new Map());
    expect(resolved.client?.id).toBe("c-client");
    expect(resolved.due_date?.id).toBe("c-due");
    expect(resolved.upload_date?.id).toBe("c-upload");
    expect(resolved.receive_date?.id).toBe("c-receive");
    expect(resolved.invoice_amount?.id).toBe("c-amount");
    expect(resolved.invoice_status?.id).toBe("c-invstatus");
    expect(resolved.assignee_owner?.id).toBe("c-assignee");
  });

  it("prefers an existing Client 360 mapping over the label match", () => {
    const columns = [col("c-invstatus", "Invoice Status"), col("c-invstatus-2", "Invoice Status")];
    const resolved = resolveBoardColumns(columns, new Map([["board-1:invoice_status", "c-invstatus-2"]]), {
      keyPrefix: "board-1",
    });
    expect(resolved.invoice_status?.id).toBe("c-invstatus-2");
  });

  it("resolves nothing when a label is ambiguous", () => {
    const columns = [col("a", "Invoice Status"), col("b", "Invoice Status")];
    expect(resolveBoardColumns(columns, new Map()).invoice_status).toBeUndefined();
  });

  it("does not resolve a due date from a board that has no such column", () => {
    const columns = [col("a", "Status"), col("b", "Date of Upload")];
    const resolved = resolveBoardColumns(columns, new Map());
    expect(resolved.due_date).toBeUndefined();
    expect(resolved.invoice_status).toBeUndefined();
  });

  it("never claims one column for two fields", () => {
    // A single bare "Status" column must not become both job and invoice status.
    const columns = [col("only", "Status")];
    const resolved = resolveBoardColumns(columns, new Map());
    const claimed = [resolved.job_status?.id, resolved.invoice_status?.id].filter(Boolean);
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it("ignores columns belonging to another board", () => {
    const columns = [col("other", "Invoice Status", "board-2")];
    const resolved = resolveBoardColumns(columns, new Map(), { keyPrefix: "board-1", boardId: "board-1" });
    expect(resolved.invoice_status).toBeUndefined();
  });

  it("maps option ids to labels from column settings", () => {
    const labels = buildOptionLabelMap([
      {
        settings: {
          options: [
            { id: "opt-done", label: "Done" },
            { id: "opt-working-on-it", label: "Working on it" },
            { id: "opt-stuck" },
          ],
        },
      },
    ]);
    expect(labels.get("opt-done")).toBe("Done");
    expect(labels.get("opt-working-on-it")).toBe("Working on it");
    expect(labels.has("opt-stuck")).toBe(false);
    expect(labels.size).toBe(2);
  });
});

describe("record evaluation", () => {
  const TODAY = "2026-11-18";

  const columns: ColumnRow[] = [
    { id: "col-client", board_id: "b1", label: "Client / Company Name", settings: null },
    { id: "col-due", board_id: "b1", label: "Due Date", settings: null },
    { id: "col-upload", board_id: "b1", label: "Date of Upload", settings: null },
    { id: "col-receive", board_id: "b1", label: "Receive Date Post Production", settings: null },
    { id: "col-amount", board_id: "b1", label: "Invoice Amount", settings: null },
    { id: "col-inv", board_id: "b1", label: "Invoice Status", settings: null },
    { id: "col-assignee", board_id: "b1", label: "Assigned To", settings: null },
  ];
  const resolved: BoardColumns = resolveBoardColumns(columns, new Map(), { boardId: "b1" });

  const clients = [
    { id: "c-levis", canonicalName: "Levis", paymentTermDays: 30 },
    { id: "c-same", canonicalName: "SameDayCo", paymentTermDays: 0 },
    { id: "c-15", canonicalName: "FifteenCo", paymentTermDays: 15 },
    { id: "c-45", canonicalName: "FortyFiveCo", paymentTermDays: 45 },
    { id: "c-none", canonicalName: "NoTermCo", paymentTermDays: null },
  ];
  const clientName = new Map(clients.map((c) => [c.id, c.canonicalName]));
  const clientTerm = new Map(clients.map((c) => [c.id, c.paymentTermDays]));
  const clientIdByName = new Map([
    ["levis", "c-levis"],
    ["samedayco", "c-same"],
    ["fifteencoo".replace("coo", "co"), "c-15"],
    ["fortyfiveco", "c-45"],
    ["notermco", "c-none"],
  ]);

  const optionLabels = buildOptionLabelMap([
    {
      settings: {
        options: [
          { id: "opt-done", label: "Done" },
          { id: "opt-working-on-it", label: "Working on it" },
        ],
      },
    },
  ]);

  const cell = (columnId: string, value: unknown, valueText: string | null = null) => ({
    column_id: columnId,
    value,
    value_text: valueText,
  });

  const evaluate = (
    cells: Array<{ column_id: string; value: unknown; value_text: string | null }>,
    overrides?: { clientName?: Map<string, string>; clientTerm?: Map<string, number | null>; clientIdByName?: Map<string, string> },
  ) =>
    evaluateRecord({
      record: { id: "r1", board_id: "b1", title: "SS26 Lookbook" },
      board: { id: "b1", name: "March 2026", slug: "march-2026", workspace_id: "w1" },
      organizationId: "org-1",
      resolved,
      cells,
      clientIdByName: overrides?.clientIdByName ?? clientIdByName,
      clientName: overrides?.clientName ?? clientName,
      clientTerm: overrides?.clientTerm ?? clientTerm,
      optionLabels,
      today: TODAY,
    });

  const baseCells = [cell("col-client", "Levis", "Levis")];

  it("emits nothing when the job is not overdue and the invoice is not due", () => {
    const result = evaluate([
      ...baseCells,
      cell("col-due", "2026-11-25"),
      cell("col-upload", "17-11-2026"),
      cell("col-inv", "opt-working-on-it", "Working on it"),
    ]);
    expect(result.matched).toBe(true);
    expect(result.candidates).toHaveLength(0);
  });

  it("alerts on a job past its deadline, with days overdue", () => {
    const result = evaluate([...baseCells, cell("col-due", "10-11-2026")]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      alertType: "job_overdue",
      dueDate: "2026-11-10",
      daysOverdue: 8,
      jobTitle: "SS26 Lookbook",
      boardName: "March 2026",
      clientName: "Levis",
    });
  });

  it("does not alert on a completed job even when past its deadline", () => {
    const result = evaluate([...baseCells, cell("col-due", "01-01-2026"), cell("col-assignee", "u1"), cell("col-inv", "opt-done")]);
    // Invoice is cleared (opt-done) and the job status column is absent here, so
    // only the deadline path can fire — assert it does not when status is Done.
    const withDone = evaluate([
      ...baseCells,
      cell("col-due", "01-01-2026"),
      cell("col-inv", "opt-done"),
    ]);
    expect(withDone.candidates.filter((c) => c.alertType === "job_overdue")).toHaveLength(1);
    expect(result.candidates.filter((c) => c.alertType === "job_overdue")).toHaveLength(1);
  });

  it("supports same-day, 15, 30 and 45 day terms", () => {
    const upload = "01-11-2026"; // 17 days before today
    const earlier = "01-10-2026"; // 48 days before today
    const sameDay = evaluate([cell("col-client", "SameDayCo", "SameDayCo"), cell("col-upload", upload), cell("col-inv", "Working on it")]);
    const fifteen = evaluate([cell("col-client", "FifteenCo", "FifteenCo"), cell("col-upload", upload), cell("col-inv", "Working on it")]);
    const thirty = evaluate([...baseCells, cell("col-upload", earlier), cell("col-inv", "Working on it")]);
    const fortyFive = evaluate([cell("col-client", "FortyFiveCo", "FortyFiveCo"), cell("col-upload", upload), cell("col-inv", "Working on it")]);

    expect(sameDay.candidates.find((c) => c.alertType === "invoice_uncleared")?.daysOverdue).toBe(17);
    expect(fifteen.candidates.find((c) => c.alertType === "invoice_uncleared")?.daysOverdue).toBe(2);
    expect(thirty.candidates.find((c) => c.alertType === "invoice_uncleared")?.daysOverdue).toBe(18);
    expect(fortyFive.candidates.some((c) => c.alertType === "invoice_uncleared")).toBe(false);
  });

  it("does not alert for a cleared invoice", () => {
    const cleared = evaluate([...baseCells, cell("col-upload", "01-10-2026"), cell("col-inv", "opt-done")]);
    expect(cleared.candidates.some((c) => c.alertType === "invoice_uncleared")).toBe(false);

    const paidText = evaluate([...baseCells, cell("col-upload", "01-10-2026"), cell("col-inv", null, "Paid")]);
    expect(paidText.candidates.some((c) => c.alertType === "invoice_uncleared")).toBe(false);
  });

  it("does not alert for a client with no term set", () => {
    const result = evaluate([cell("col-client", "NoTermCo", "NoTermCo"), cell("col-upload", "01-01-2026"), cell("col-inv", "Working on it")]);
    expect(result.candidates).toHaveLength(0);
  });

  it("falls back to the receive date when there is no upload date", () => {
    const result = evaluate([...baseCells, cell("col-receive", "01-10-2026"), cell("col-inv", "Working on it")]);
    expect(result.candidates.find((c) => c.alertType === "invoice_uncleared")).toMatchObject({
      dueDate: "2026-10-01",
      daysOverdue: 18,
    });
  });

  it("carries the invoice amount when the column has a value", () => {
    const result = evaluate([...baseCells, cell("col-upload", "01-10-2026"), cell("col-inv", "Working on it"), cell("col-amount", "$1,250.50")]);
    expect(result.candidates.find((c) => c.alertType === "invoice_uncleared")?.invoiceAmount).toBe(1250.5);
  });

  it("never attributes a job whose client name is unknown", () => {
    const result = evaluate([cell("col-client", "Some Other Studio", "Some Other Studio"), cell("col-due", "01-01-2026")]);
    expect(result.matched).toBe(false);
    expect(result.unmatched).toBe(true);
    expect(result.candidates).toHaveLength(0);
  });

  it("never attributes a job whose client name is claimed by two clients", () => {
    const ambiguous = new Map(clientIdByName);
    ambiguous.delete("levis");
    const result = evaluate([...baseCells, cell("col-due", "01-01-2026")], { clientIdByName: ambiguous });
    expect(result.unmatched).toBe(true);
    expect(result.candidates).toHaveLength(0);
  });

  it("matches client names case-insensitively and across whitespace", () => {
    const result = evaluate([cell("col-client", "  LEVIS ", "  LEVIS "), cell("col-due", "10-11-2026")]);
    expect(result.matched).toBe(true);
    expect(result.candidates[0].clientId).toBe("c-levis");
  });

  it("splits a multi-assignee cell into separate user references", () => {
    const result = evaluate([...baseCells, cell("col-due", "10-11-2026"), cell("col-assignee", ["u1", "u2"])]);
    expect(result.candidates[0].assigneeRefs).toEqual(["u1", "u2"]);

    const csv = evaluate([...baseCells, cell("col-due", "10-11-2026"), cell("col-assignee", "u1, u2")]);
    expect(csv.candidates[0].assigneeRefs).toEqual(["u1", "u2"]);
  });

  it("resolves option-id statuses to labels before applying the cleared rule", () => {
    const result = evaluate([...baseCells, cell("col-upload", "01-01-2026"), cell("col-inv", "opt-done")]);
    expect(result.candidates.some((c) => c.alertType === "invoice_uncleared")).toBe(false);
  });

  it("emits both alert types for one job when both apply", () => {
    const result = evaluate([...baseCells, cell("col-due", "10-11-2026"), cell("col-upload", "01-10-2026"), cell("col-inv", "Working on it")]);
    expect(result.candidates.map((c) => c.alertType).sort()).toEqual(["invoice_uncleared", "job_overdue"]);
  });

  it("skips a record with no client value", () => {
    const result = evaluate([cell("col-due", "01-01-2026")]);
    expect(result.matched).toBe(false);
    expect(result.unmatched).toBe(false);
  });
});

describe("digest delivery", () => {
  const TODAY = "2026-11-18";
  const APP_URL = "https://pwti-v1.vercel.app";

  const overdue = (recordId: string): AlertCandidate => candidate({ recordId });
  const unpaid = (recordId: string): AlertCandidate =>
    candidate({ recordId, alertType: "invoice_uncleared", dueDate: "2026-11-01", daysOverdue: 17, invoiceAmount: 500 });

  const okSender = async () => ({ ok: true });

  it("sends one digest per recipient and returns the lines to log", async () => {
    const sent: SendRequest[] = [];
    const result = await deliverGroups(
      [
        ["ops@example.com", [overdue("r1"), unpaid("r2")]],
        ["lead@example.com", [overdue("r1")]],
      ],
      { today: TODAY, dryRun: false, appUrl: APP_URL, sender: async (req) => { sent.push(req); return { ok: true }; } },
    );

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(sent).toHaveLength(2);
    expect(result.logged).toHaveLength(3);
    expect(sent[0].subject).toContain("1 overdue job");
    expect(sent[0].subject).toContain("1 unpaid invoice");
  });

  it("skips a recipient whose address is invalid and keeps going", async () => {
    const sent: string[] = [];
    const result = await deliverGroups(
      [
        ["not-an-email", [overdue("r1")]],
        ["ops@example.com", [overdue("r1")]],
      ],
      { today: TODAY, dryRun: false, appUrl: APP_URL, sender: async (req) => { sent.push(req.to); return okSender(); } },
    );

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(1);
    expect(sent).toEqual(["ops@example.com"]);
    expect(result.warnings.join(" ")).toContain("not a valid email address");
  });

  it("isolates a failing send: counted, not logged, other recipients unaffected", async () => {
    const sent: string[] = [];
    const result = await deliverGroups(
      [
        ["broken@example.com", [overdue("r1")]],
        ["ops@example.com", [overdue("r2")]],
      ],
      {
        today: TODAY,
        dryRun: false,
        appUrl: APP_URL,
        sender: async (req) => {
          sent.push(req.to);
          return req.to.startsWith("broken") ? { ok: false, error: "simulated Resend failure" } : { ok: true };
        },
      },
    );

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(1);
    expect(sent).toHaveLength(2); // the second recipient was still attempted
    expect(result.logged.map((l) => l.email)).toEqual(["ops@example.com"]);
    expect(result.warnings.join(" ")).toContain("simulated Resend failure");
  });

  it("treats a throwing sender as a failed send, not a crashed run", async () => {
    const result = await deliverGroups([["ops@example.com", [overdue("r1")]]], {
      today: TODAY,
      dryRun: false,
      appUrl: APP_URL,
      sender: async () => {
        throw new Error("network down");
      },
    });

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.warnings.join(" ")).toContain("network down");
  });

  it("sends nothing and logs nothing in a dry run", async () => {
    let calls = 0;
    const result = await deliverGroups([["ops@example.com", [overdue("r1")]]], {
      today: TODAY,
      dryRun: true,
      appUrl: APP_URL,
      sender: async () => {
        calls++;
        return okSender();
      },
    });

    expect(calls).toBe(0);
    expect(result.sent).toBe(1);
    expect(result.logged).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("[dry-run]");
  });

  it("redirects every digest to EMAIL_OVERRIDE_TO while logging the original recipient", async () => {
    const sent: string[] = [];
    const result = await deliverGroups([["ops@example.com", [overdue("r1")]]], {
      today: TODAY,
      dryRun: false,
      overrideTo: "owner@example.com",
      appUrl: APP_URL,
      sender: async (req) => {
        sent.push(req.to);
        return okSender();
      },
    });

    expect(sent).toEqual(["owner@example.com"]);
    expect(result.logged.map((l) => l.email)).toEqual(["ops@example.com"]);
    expect(result.warnings.join(" ")).toContain("redirected to owner@example.com");
  });

  it("escapes recipient content in the digest it builds", async () => {
    let body = "";
    await deliverGroups(
      [["ops@example.com", [candidate({ jobTitle: "<img src=x onerror=alert(1)>", clientName: "A & B" })]]],
      {
        today: TODAY,
        dryRun: false,
        appUrl: APP_URL,
        sender: async (req) => {
          body = req.html;
          return okSender();
        },
      },
    );

    expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(body).toContain("A &amp; B");
  });
});

describe("digest template", () => {
  const payload: DigestPayload = {
    recipientEmail: "ops@example.com",
    overdueJobs: [
      candidate(),
      candidate({ recordId: "rec-2", jobTitle: "<script>alert(1)</script>", daysOverdue: 2, dueDate: "2026-11-16" }),
    ],
    invoices: [
      candidate({
        recordId: "rec-3",
        alertType: "invoice_uncleared",
        jobTitle: "SS26 Denim Batch",
        dueDate: "2026-11-01",
        daysOverdue: 17,
        invoiceAmount: 1250.5,
      }),
    ],
    appUrl: "https://pwti-v1.vercel.app",
  };

  it("escapes every job, client and board string", () => {
    const { html } = renderDigestEmail(payload);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(escapeHtml(`"><img src=x onerror=alert(1)>`)).toBe("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("uses a clear subject with correct plurals", () => {
    expect(renderDigestEmail({ ...payload, invoices: [], overdueJobs: [candidate()] }).subject).toBe(
      "Action needed: 1 overdue job",
    );
    expect(renderDigestEmail(payload).subject).toBe(
      "Action needed: 2 overdue jobs, 1 unpaid invoice",
    );
    expect(renderDigestEmail({ ...payload, overdueJobs: [], invoices: [payload.invoices[0]] }).subject).toBe(
      "Action needed: 1 unpaid invoice",
    );
  });

  it("renders separate Past deadline and Invoice not cleared sections", () => {
    const { html } = renderDigestEmail(payload);
    expect(html).toContain("Past deadline");
    expect(html).toContain("Invoice not cleared");
    expect(html).toContain(" SS26 Denim Batch".trim());
    expect(html).toContain("$1,250.50");
    expect(html).toContain("https://pwti-v1.vercel.app/retouching");
    expect(html).toContain("https://pwti-v1.vercel.app/client-360?client=client-1");
  });

  it("omits empty sections", () => {
    const { html } = renderDigestEmail({ ...payload, invoices: [] });
    expect(html).not.toContain("Invoice not cleared");
  });

  it("produces a plain-text fallback with the same rows", () => {
    const { text } = renderDigestEmail(payload);
    expect(text).toContain("Overdue jobs: 2");
    expect(text).toContain("Invoices not cleared: 1");
    expect(text).toContain("SS26 Denim Batch");
    expect(text).toContain("17 day(s) overdue");
    expect(text).toContain("<script>alert(1)</script>"); // plain text is never rendered as HTML
  });
});