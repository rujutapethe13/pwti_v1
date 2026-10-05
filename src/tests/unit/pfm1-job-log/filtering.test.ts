import { describe, expect, it } from "vitest";

import type { JobLogRow } from "@/features/pfm1-job-log/types";
import {
  searchJobs,
  applyFilters,
  filterAndSearch,
  distinctClients,
  distinctJobTypes,
  distinctStatuses,
  distinctMonths,
  DEFAULT_FILTERS,
} from "@/features/pfm1-job-log/lib/filtering";
import { computeKpis, computeJobsByMonth, computeJobsByType, computeTopClients } from "@/features/pfm1-job-log/lib/aggregation";

const mockRows: JobLogRow[] = [
  {
    id: "pfm1-001",
    client: "Acme Pictures",
    jobType: "Color Grading",
    batch: "PF-BATCH-2025-Q1-01",
    received: "2025-01-04",
    uploaded: "2025-01-10",
    skus: 420,
    comment: "Dolby Vision deliverables",
    status: "Completed",
    updatedAt: "2025-01-10",
  },
  {
    id: "pfm1-002",
    client: "Bloom Films",
    jobType: "VFX",
    batch: "PF-BATCH-2025-Q1-01",
    received: "2025-01-06",
    uploaded: "2025-01-20",
    skus: 1850,
    comment: "Hero shots for teaser",
    status: "Completed",
    updatedAt: "2025-01-20",
  },
  {
    id: "pfm1-003",
    client: "Canvas Studio",
    jobType: "Editorial",
    batch: "PF-BATCH-2025-Q1-02",
    received: "2025-02-08",
    uploaded: null,
    skus: 310,
    comment: "Offline assembly",
    status: "In Progress",
    updatedAt: "2025-02-15",
  },
  {
    id: "pfm1-004",
    client: "Acme Pictures",
    jobType: "Sound Design",
    batch: "PF-BATCH-2025-Q2-03",
    received: "2025-04-10",
    uploaded: "2025-01-20",
    skus: 1200,
    comment: "Temp score sync",
    status: "Pending",
    updatedAt: "2025-04-10",
  },
  {
    id: "pfm1-005",
    client: "Dune Media",
    jobType: "Compositing",
    batch: "PF-BATCH-2025-Q2-04",
    received: "2025-05-14",
    uploaded: "2025-05-28",
    skus: 2300,
    comment: "Multi-layer comp passes",
    status: "Completed",
    updatedAt: "2025-05-28",
  },
  {
    id: "pfm1-006",
    client: "Acme Pictures",
    jobType: "Color Grading",
    batch: "PF-BATCH-2025-Q3-05",
    received: "2025-07-12",
    uploaded: "2025-07-16",
    skus: 890,
    comment: "HDR grade",
    status: "Completed",
    updatedAt: "2025-07-16",
  },
];

describe("searchJobs", () => {
  it("returns all rows when query is empty", () => {
    expect(searchJobs(mockRows, "")).toHaveLength(6);
    expect(searchJobs(mockRows, "   ")).toHaveLength(6);
  });

  it("matches by client name (case-insensitive)", () => {
    expect(searchJobs(mockRows, "acme").map((r) => r.id)).toEqual(["pfm1-001", "pfm1-004", "pfm1-006"]);
  });

  it("matches by job type", () => {
    expect(searchJobs(mockRows, "vfx").map((r) => r.id)).toEqual(["pfm1-002"]);
  });

  it("matches by batch", () => {
    expect(searchJobs(mockRows, "Q1-01").map((r) => r.id)).toEqual(["pfm1-001", "pfm1-002"]);
  });

  it("matches by comment", () => {
    expect(searchJobs(mockRows, "dolby").map((r) => r.id)).toEqual(["pfm1-001"]);
  });

  it("matches by status", () => {
    expect(searchJobs(mockRows, "pend").map((r) => r.id)).toEqual(["pfm1-004"]);
  });

  it("returns empty when no match", () => {
    expect(searchJobs(mockRows, "nonexistent")).toHaveLength(0);
  });
});

describe("applyFilters", () => {
  it("returns all rows when no filters are set", () => {
    expect(applyFilters(mockRows, DEFAULT_FILTERS)).toHaveLength(6);
  });

  it("filters by client", () => {
    expect(applyFilters(mockRows, { ...DEFAULT_FILTERS, client: "Acme Pictures" }).map((r) => r.id)).toEqual([
      "pfm1-001",
      "pfm1-004",
      "pfm1-006",
    ]);
  });

  it("filters by job type", () => {
    expect(applyFilters(mockRows, { ...DEFAULT_FILTERS, jobType: "Color Grading" }).map((r) => r.id)).toEqual([
      "pfm1-001",
      "pfm1-006",
    ]);
  });

  it("filters by status", () => {
    expect(applyFilters(mockRows, { ...DEFAULT_FILTERS, status: "Completed" }).map((r) => r.id)).toEqual([
      "pfm1-001",
      "pfm1-002",
      "pfm1-005",
      "pfm1-006",
    ]);
  });

  it("filters by month (YYYY-MM from received date)", () => {
    expect(applyFilters(mockRows, { ...DEFAULT_FILTERS, month: "2025-01" }).map((r) => r.id)).toEqual([
      "pfm1-001",
      "pfm1-002",
    ]);
    expect(applyFilters(mockRows, { ...DEFAULT_FILTERS, month: "2025-02" }).map((r) => r.id)).toEqual(["pfm1-003"]);
    expect(applyFilters(mockRows, { ...DEFAULT_FILTERS, month: "2025-05" }).map((r) => r.id)).toEqual(["pfm1-005"]);
  });

  it("combines multiple filters with AND logic", () => {
    const result = applyFilters(mockRows, {
      ...DEFAULT_FILTERS,
      client: "Acme Pictures",
      status: "Completed",
    });
    expect(result.map((r) => r.id)).toEqual(["pfm1-001", "pfm1-006"]);
  });
});

describe("filterAndSearch", () => {
  it("applies both search and filters", () => {
    const result = filterAndSearch(
      mockRows,
      { ...DEFAULT_FILTERS, status: "Completed" },
      "acme",
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("pfm1-001");
  });
});

describe("distinct values", () => {
  it("distinctClients returns unique sorted client names", () => {
    expect(distinctClients(mockRows)).toEqual([
      "Acme Pictures",
      "Bloom Films",
      "Canvas Studio",
      "Dune Media",
    ]);
  });

  it("distinctJobTypes returns unique sorted job types", () => {
    expect(distinctJobTypes(mockRows)).toEqual([
      "Color Grading",
      "Compositing",
      "Editorial",
      "Sound Design",
      "VFX",
    ]);
  });

  it("distinctStatuses returns unique sorted statuses", () => {
    expect(distinctStatuses(mockRows)).toEqual(["Completed", "In Progress", "Pending"]);
  });

  it("distinctMonths returns unique sorted months (desc)", () => {
    expect(distinctMonths(mockRows)).toEqual(["2025-07", "2025-05", "2025-04", "2025-02", "2025-01"]);
  });
});

describe("computeKpis", () => {
  it("computes correct KPIs from rows", () => {
    const kpis = computeKpis(mockRows);
    expect(kpis.totalJobs).toBe(6);
    expect(kpis.completed).toBe(4);
    expect(kpis.pending).toBe(1);
    expect(kpis.activeClients).toBe(4);
    expect(kpis.skusProcessed).toBe(420 + 1850 + 310 + 1200 + 2300 + 890);
    expect(kpis.completionRate).toBe(67);
  });

  it("returns zero KPIs for empty rows", () => {
    const kpis = computeKpis([]);
    expect(kpis.totalJobs).toBe(0);
    expect(kpis.completed).toBe(0);
    expect(kpis.completionRate).toBe(0);
    expect(kpis.activeClients).toBe(0);
    expect(kpis.skusProcessed).toBe(0);
  });
});

describe("computeJobsByMonth", () => {
  it("groups jobs by month and sorts chronologically", () => {
    const data = computeJobsByMonth(mockRows);
    expect(data).toEqual([
      { label: "Jan 2025", value: 2 },
      { label: "Feb 2025", value: 1 },
      { label: "Apr 2025", value: 1 },
      { label: "May 2025", value: 1 },
      { label: "Jul 2025", value: 1 },
    ]);
  });

  it("returns empty array for no rows", () => {
    expect(computeJobsByMonth([])).toEqual([]);
  });
});

describe("computeJobsByType", () => {
  it("groups jobs by type and sorts descending", () => {
    const data = computeJobsByType(mockRows);
    expect(data[0].name).toBe("Color Grading");
    expect(data[0].count).toBe(2);
    expect(data[0].color).toBeDefined();
    // Verify descending order
    for (let i = 1; i < data.length; i++) {
      expect(data[i].count).toBeLessThanOrEqual(data[i - 1].count);
    }
  });

  it("returns empty array for no rows", () => {
    expect(computeJobsByType([])).toEqual([]);
  });
});

describe("computeTopClients", () => {
  it("ranks clients by job count", () => {
    const data = computeTopClients(mockRows);
    expect(data[0].name).toBe("Acme Pictures");
    expect(data[0].count).toBe(3);
    // Verify descending order
    for (let i = 1; i < data.length; i++) {
      expect(data[i].count).toBeLessThanOrEqual(data[0].count);
    }
  });

  it("returns empty array for no rows", () => {
    expect(computeTopClients([])).toEqual([]);
  });
});
