import { describe, it, expect } from "vitest";
import {
  calculateDueDate,
  evaluateJobOverdue,
  resolveOverdueRecipients,
  interpolateMergeFields,
} from "@/features/automations/payment-overdue-service";
import {
  executeAutomationRule,
} from "@/features/automations/automation-engine";
import type { PaymentJobItem, AutomationRule } from "@/features/automations/types";
import { INITIAL_AUTOMATION_RULES, MOCK_PAYMENT_JOBS } from "@/features/automations/automation-mock-data";

describe("Payment Terms & Due Date Calculation", () => {
  it("calculates Immediate terms as the exact booked date", () => {
    const booked = "2026-10-15";
    const due = calculateDueDate(booked, "Immediate");
    expect(due).toBe("2026-10-15");
  });

  it("calculates 15 days terms correctly", () => {
    const booked = "2026-10-02";
    const due = calculateDueDate(booked, "15 days");
    expect(due).toBe("2026-10-17");
  });

  it("calculates 30 days terms correctly", () => {
    const booked = "2026-10-01";
    const due = calculateDueDate(booked, "30 days");
    expect(due).toBe("2026-10-31");
  });

  it("calculates 45 days terms correctly across months", () => {
    const booked = "2026-09-01";
    const due = calculateDueDate(booked, "45 days");
    expect(due).toBe("2026-10-16");
  });

  it("calculates Custom terms days correctly", () => {
    const booked = "2026-10-01";
    const due = calculateDueDate(booked, "Custom", 60);
    expect(due).toBe("2026-11-30");
  });
});

describe("Payment Overdue Trigger Evaluation", () => {
  const sampleOverdueJob: PaymentJobItem = {
    id: "test-overdue-1",
    jobTitle: "Test Overdue Item",
    clientId: "c-1",
    clientName: "Safari Studio",
    boardId: "b-1",
    boardName: "October Board",
    amount: 24500,
    jobBookedDate: "2026-10-02",
    paymentTerms: "15 days",
    paymentDueDate: "2026-10-17",
    paymentStatus: "Unpaid",
    assignee: {
      id: "usr-1",
      name: "Jordan Lee",
      email: "jordan@studio.com",
    },
    boardOwner: {
      id: "usr-2",
      name: "Alex Morgan",
      email: "alex@studio.com",
    },
  };

  it("flags job as overdue when reference date is past due date", () => {
    const refDate = new Date("2026-10-30T10:00:00Z");
    const result = evaluateJobOverdue(sampleOverdueJob, { referenceDate: refDate });
    expect(result.isOverdue).toBe(true);
    expect(result.daysOverdue).toBe(13);
  });

  it("does not flag job as overdue when payment status is Paid", () => {
    const paidJob: PaymentJobItem = {
      ...sampleOverdueJob,
      paymentStatus: "Paid",
    };
    const refDate = new Date("2026-10-30T10:00:00Z");
    const result = evaluateJobOverdue(paidJob, { referenceDate: refDate });
    expect(result.isOverdue).toBe(false);
    expect(result.daysOverdue).toBe(0);
  });

  it("respects grace period days", () => {
    const refDate = new Date("2026-10-19T10:00:00Z");
    // Due Oct 17. Grace period: 3 days -> effective due Oct 20. On Oct 19, it should NOT be overdue.
    const result = evaluateJobOverdue(sampleOverdueJob, {
      referenceDate: refDate,
      gracePeriodDays: 3,
    });
    expect(result.isOverdue).toBe(false);
  });
});

describe("Recipient Resolution & Deduplication", () => {
  it("resolves top 3 admins, board owner, and assignee with deduplication", () => {
    const jobWithOverlap: PaymentJobItem = {
      id: "job-overlap",
      jobTitle: "Overlap Job",
      clientId: "c-1",
      clientName: "Client A",
      boardId: "b-1",
      boardName: "Board 1",
      amount: 10000,
      jobBookedDate: "2026-10-01",
      paymentTerms: "30 days",
      paymentDueDate: "2026-10-31",
      paymentStatus: "Unpaid",
      // Board owner is ALSO one of the workspace admins!
      boardOwner: {
        id: "adm-1",
        name: "Rujuta Pethe",
        email: "rujutapethe@gmail.com",
      },
      assignee: {
        id: "usr-dev",
        name: "Devon Clark",
        email: "devon@powerweave.studio",
      },
    };

    const resolved = resolveOverdueRecipients(jobWithOverlap);
    const emails = resolved.recipients.map((r) => r.email);

    // Should contain Rujuta only ONCE
    const rujutaOccurrences = emails.filter((e) => e === "rujutapethe@gmail.com").length;
    expect(rujutaOccurrences).toBe(1);

    // Total unique recipients: Rujuta Pethe + Finance Lead + Studio Admin + Devon Clark = 4
    expect(resolved.recipients.length).toBe(4);
  });

  it("surfaces warnings if a recipient has no email configured", () => {
    const jobMissingEmail: PaymentJobItem = {
      id: "job-missing",
      jobTitle: "Missing Email Job",
      clientId: "c-1",
      clientName: "Client B",
      boardId: "b-1",
      boardName: "Board 2",
      amount: 5000,
      jobBookedDate: "2026-10-01",
      paymentTerms: "15 days",
      paymentDueDate: "2026-10-16",
      paymentStatus: "Unpaid",
      boardOwner: {
        id: "usr-ghost",
        name: "Ghost Owner",
        email: "",
      },
      assignee: {
        id: "usr-3",
        name: "Active Assignee",
        email: "assignee@studio.com",
      },
    };

    const resolved = resolveOverdueRecipients(jobMissingEmail);
    expect(resolved.warnings.length).toBeGreaterThan(0);
    expect(resolved.warnings[0]).toContain("Ghost Owner");
  });
});

describe("Merge Field Interpolation", () => {
  it("interpolates all template fields correctly", () => {
    const job = MOCK_PAYMENT_JOBS[0]; // Safari 4742
    const template = "Alert: {client_name} - {job_title} is overdue by {days_overdue} days for {amount}";
    const output = interpolateMergeFields(template, job, "Sarah", 13);

    expect(output).toContain("Safari");
    expect(output).toContain("PFM1_4742");
    expect(output).toContain("13 days");
    expect(output).toContain("$24,500");
  });
});

describe("Automation Execution Engine & Safeguards", () => {
  it("executes the overdue payment rule and produces an audit log", () => {
    const overdueRule = INITIAL_AUTOMATION_RULES.find((r) => r.trigger.type === "payment_overdue")!;
    const overdueJob = MOCK_PAYMENT_JOBS[0];

    const result = executeAutomationRule(overdueRule, overdueJob);

    expect(result.matched).toBe(true);
    expect(result.status).toBe("success");
    expect(result.actionsExecuted.length).toBe(2);
    expect(result.log).toBeDefined();
    expect(result.log?.status).toBe("success");
  });

  it("respects the disabled toggle and skips execution", () => {
    const rule: AutomationRule = {
      ...INITIAL_AUTOMATION_RULES[0],
      enabled: false,
    };
    const overdueJob = MOCK_PAYMENT_JOBS[0];

    const result = executeAutomationRule(rule, overdueJob);
    expect(result.matched).toBe(false);
    expect(result.status).toBe("skipped");
  });

  it("detects infinite cascade loops and halts execution", () => {
    const rule = INITIAL_AUTOMATION_RULES[0];
    const job = MOCK_PAYMENT_JOBS[0];

    // Simulate recursion at depth 4
    const result = executeAutomationRule(rule, job, {
      depth: 4,
      maxDepth: 3,
      executedRuleIds: new Set([rule.id]),
    });

    expect(result.matched).toBe(false);
    expect(result.status).toBe("error");
    expect(result.reason).toContain("Infinite cascade loop detected");
  });

  it("actually mutates the target item when change_status action executes", () => {
    const statusRule: AutomationRule = {
      id: "rule-test-status",
      name: "When Date arrives, change status to Done",
      description: "Test recipe",
      category: "Custom",
      enabled: true,
      owner: { id: "u-1", name: "Alex", email: "alex@powerweave.studio" },
      createdAt: new Date().toISOString(),
      runCount: 0,
      trigger: { type: "date_arrives", label: "Date arrives" },
      conditions: [],
      actions: [
        {
          id: "act-change-status",
          type: "change_status",
          label: "Change status to Done",
          targetColumnName: "Status",
          targetValue: "Done",
        },
      ],
      safeguards: {
        maxDailyRuns: 1000,
        dailyRunsCount: 0,
        dryRun: false,
        loopPreventionKey: "test",
      },
    };

    const initialJob = { ...MOCK_PAYMENT_JOBS[0], paymentStatus: "Unpaid" as const };
    const result = executeAutomationRule(statusRule, initialJob);

    expect(result.matched).toBe(true);
    expect(result.status).toBe("success");
    expect(result.updatedJob).toBeDefined();
    expect(result.updatedJob?.paymentStatus).toBe("Done");
    expect((result.updatedJob as Record<string, unknown>)?.status).toBe("Done");
    expect(result.appliedSummary).toContain('Updated Status to "Done"');
  });
});
