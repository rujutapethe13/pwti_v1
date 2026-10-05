/**
 * PFM1 Job Log — Mock Seed Data
 *
 * Realistic production tracker data for creative studios.
 * 45 job rows across 8 clients, 8 job types, and 4 quarters.
 * This data is persisted to localStorage on first load and
 * survives page refreshes via `usePersistedState`.
 */

import type { JobLogRow, JobStatus } from "../types";

export const CLIENTS = [
  "Acme Pictures",
  "Bloom Films",
  "Canvas Studio",
  "Dune Media",
  "Echo House",
  "Forge Creative",
  "Granite Productions",
  "Harbor Lights",
] as const;

export const JOB_TYPES = [
  "Color Grading",
  "VFX",
  "Editorial",
  "Motion Graphics",
  "Sound Design",
  "Animation",
  "Compositing",
  "Retouching",
] as const;

export const STATUSES: JobLogRow["status"][] = [
  "Completed",
  "Pending",
  "In Progress",
  "Delayed",
];

function batchFor(year: number, quarter: number, index: number): string {
  return `PF-BATCH-${year}-Q${quarter}-${String(index).padStart(2, "0")}`;
}

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function generateMockJobs(): JobLogRow[] {
  const rows: JobLogRow[] = [];
  let counter = 1;

  function add(
    client: string,
    jobType: string,
    batch: string,
    received: string,
    uploaded: string | null,
    skus: number,
    comment: string,
    status: JobStatus = "In Progress",
  ) {
    rows.push({
      id: `pfm1-${String(counter++).padStart(3, "0")}`,
      client,
      jobType,
      batch,
      received,
      uploaded,
      skus,
      comment,
      status,
      updatedAt: uploaded ?? received,
    });
  }

  const BQ = batchFor;
  const D = dateStr;

  // Q1 2025
  add("Acme Pictures", "Color Grading", BQ(2025, 1, 1), D(2025, 1, 4), D(2025, 1, 10), 420, "Dolby Vision deliverables", "Completed" as JobStatus);
  add("Acme Pictures", "VFX", BQ(2025, 1, 1), D(2025, 1, 6), D(2025, 1, 20), 1850, "Hero shots for teaser", "Completed");
  add("Bloom Films", "Editorial", BQ(2025, 1, 2), D(2025, 1, 8), D(2025, 1, 18), 310, "Offline assembly", "Completed");
  add("Bloom Films", "Sound Design", BQ(2025, 1, 2), D(2025, 1, 10), null, 1200, "Temp score sync", "In Progress" as JobStatus);
  add("Canvas Studio", "Motion Graphics", BQ(2025, 1, 3), D(2025, 1, 12), D(2025, 1, 16), 55, "Main titles sequence", "Completed");
  add("Canvas Studio", "Compositing", BQ(2025, 1, 3), D(2025, 1, 14), D(2025, 1, 25), 2300, "Multi-layer comp passes", "In Progress");
  add("Dune Media", "Retouching", BQ(2025, 1, 4), D(2025, 1, 15), D(2025, 1, 19), 890, "E-commerce campaign", "Completed");
  add("Echo House", "Animation", BQ(2025, 1, 5), D(2025, 1, 18), null, 1600, "Explainer video rigs", "Pending" as JobStatus);

  // Q2 2025
  add("Forge Creative", "Editorial", BQ(2025, 2, 1), D(2025, 4, 2), D(2025, 4, 12), 720, "Documentary cut", "Completed");
  add("Forge Creative", "Color Grading", BQ(2025, 2, 2), D(2025, 4, 5), D(2025, 4, 9), 380, "Rec709 grade", "Completed");
  add("Acme Pictures", "VFX", BQ(2025, 2, 3), D(2025, 4, 10), null, 2100, "Environment extensions", "In Progress");
  add("Acme Pictures", "Sound Design", BQ(2025, 2, 3), D(2025, 4, 12), D(2025, 4, 22), 950, "5.1 mix prep", "Completed");
  add("Granite Productions", "Compositing", BQ(2025, 2, 4), D(2025, 4, 14), D(2025, 4, 28), 1400, "Matchmove integration", "Completed");
  add("Granite Productions", "VFX", BQ(2025, 2, 4), D(2025, 4, 16), null, 650, "Particle sims", "Pending");
  add("Harbor Lights", "Motion Graphics", BQ(2025, 2, 5), D(2025, 4, 18), D(2025, 4, 24), 75, "Social bumpers", "Completed");
  add("Harbor Lights", "Animation", BQ(2025, 2, 5), D(2025, 4, 20), D(2025, 5, 3), 3200, "Character animation", "In Progress");

  // Q3 2025
  add("Bloom Films", "Color Grading", BQ(2025, 3, 1), D(2025, 7, 3), D(2025, 7, 8), 260, "Log-to-LUT conversion", "Completed");
  add("Canvas Studio", "VFX", BQ(2025, 3, 2), D(2025, 7, 6), D(2025, 7, 18), 1900, "Digital matte paintings", "Completed");
  add("Canvas Studio", "Editorial", BQ(2025, 3, 2), D(2025, 7, 9), null, 430, "Rough cut review", "Pending");
  add("Dune Media", "Compositing", BQ(2025, 3, 3), D(2025, 7, 11), D(2025, 7, 22), 1750, "Roto prep", "Completed");
  add("Dune Media", "Sound Design", BQ(2025, 3, 3), D(2025, 7, 13), D(2025, 7, 26), 880, "Foley library", "Completed");
  add("Echo House", "Retouching", BQ(2025, 3, 4), D(2025, 7, 15), D(2025, 7, 19), 1100, "Portrait retouching batch", "In Progress");
  add("Echo House", "Animation", BQ(2025, 3, 4), D(2025, 7, 17), null, 2500, "Storyboard animatics", "Pending");
  add("Forge Creative", "Motion Graphics", BQ(2025, 3, 5), D(2025, 7, 20), D(2025, 7, 25), 60, "Logo animation", "Completed");
  add("Granite Productions", "Color Grading", BQ(2025, 3, 6), D(2025, 7, 22), D(2025, 7, 29), 510, "HDR grade", "In Progress");

  // Q4 2025
  add("Harbor Lights", "VFX", BQ(2025, 4, 1), D(2025, 10, 4), D(2025, 10, 16), 1300, "Crowd replacement", "Completed");
  add("Acme Pictures", "Editorial", BQ(2025, 4, 2), D(2025, 10, 7), D(2025, 10, 14), 620, "Director's cut", "Completed");
  add("Acme Pictures", "Sound Design", BQ(2025, 4, 2), D(2025, 10, 9), null, 700, "ADR session notes", "Pending");
  add("Bloom Films", "Compositing", BQ(2025, 4, 3), D(2025, 10, 12), D(2025, 10, 24), 2200, "Stereo depth work", "Completed");
  add("Canvas Studio", "Animation", BQ(2025, 4, 4), D(2025, 10, 14), D(2025, 10, 28), 3400, "Rigging cleanup", "In Progress" as JobStatus);
  add("Canvas Studio", "Retouching", BQ(2025, 4, 4), D(2025, 10, 16), D(2025, 10, 20), 980, "Beauty retouch packs", "Completed");
  add("Dune Media", "Motion Graphics", BQ(2025, 4, 5), D(2025, 10, 18), null, 88, "Lower-third animations", "Pending");
  add("Echo House", "VFX", BQ(2025, 4, 6), D(2025, 10, 20), D(2025, 10, 31), 1650, "Soft body sims", "Completed");

  // Q1 2026
  add("Forge Creative", "Color Grading", BQ(2026, 1, 1), D(2026, 1, 5), D(2026, 1, 9), 410, "Netflix LUFS target", "Completed");
  add("Harbor Lights", "Editorial", BQ(2026, 1, 2), D(2026, 1, 8), D(2026, 1, 17), 520, "Trailer pace cut", "In Progress");
  add("Granite Productions", "VFX", BQ(2026, 1, 3), D(2026, 1, 10), D(2026, 1, 21), 1950, "Explosion elements", "Completed");
  add("Granite Productions", "Sound Design", BQ(2026, 1, 3), D(2026, 1, 12), null, 1150, "Atmos design pass", "Pending");
  add("Acme Pictures", "Compositing", BQ(2026, 1, 4), D(2026, 1, 15), D(2026, 1, 26), 1800, "Multi-pass integration", "Completed");
  add("Acme Pictures", "Animation", BQ(2026, 1, 4), D(2026, 1, 17), D(2026, 1, 30), 2900, "Facial animation", "In Progress");
  add("Bloom Films", "Motion Graphics", BQ(2026, 1, 5), D(2026, 1, 18), null, 95, "UI animation overlays", "Pending");
  add("Canvas Studio", "VFX", BQ(2026, 1, 6), D(2026, 1, 20), D(2026, 1, 31), 1450, "Fluid sims", "Completed");
  add("Dune Media", "Retouching", BQ(2026, 1, 6), D(2026, 1, 22), D(2026, 1, 26), 670, "Catalog retouch batch", "In Progress");
  add("Echo House", "Color Grading", BQ(2026, 1, 7), D(2026, 1, 24), null, 300, "ACEScct workflow setup", "Delayed" as JobStatus);
  add("Forge Creative", "Sound Design", BQ(2026, 1, 7), D(2026, 1, 25), D(2026, 2, 4), 820, "Mix room prep", "Completed");

  // Q2 2026
  add("Harbor Lights", "Compositing", BQ(2026, 2, 1), D(2026, 4, 2), D(2026, 4, 10), 1250, "Clean plate removal", "In Progress");
  add("Harbor Lights", "Animation", BQ(2026, 2, 1), D(2026, 4, 4), D(2026, 4, 14), 2400, "Background animation", "Completed");
  add("Granite Productions", "Editorial", BQ(2026, 2, 2), D(2026, 4, 6), null, 360, "Assembly edit notes", "Pending");
  add("Acme Pictures", "Motion Graphics", BQ(2026, 2, 3), D(2026, 4, 8), D(2026, 4, 13), 72, "Title sequence", "Completed");
  add("Acme Pictures", "Color Grading", BQ(2026, 2, 3), D(2026, 4, 10), D(2026, 4, 15), 490, "Final grade", "Completed");
  add("Bloom Films", "VFX", BQ(2026, 2, 4), D(2026, 4, 12), D(2026, 4, 23), 2000, "Digital set extension", "In Progress");
  add("Canvas Studio", "Sound Design", BQ(2026, 2, 4), D(2026, 4, 14), null, 960, "Ambient track build", "Pending");
  add("Dune Media", "Compositing", BQ(2026, 2, 5), D(2026, 4, 16), D(2026, 4, 27), 1600, "Keying passes", "Completed");
  add("Dune Media", "Retouching", BQ(2026, 2, 5), D(2026, 4, 18), D(2026, 4, 22), 1050, "Product retouch batch", "Completed");
  add("Echo House", "Animation", BQ(2026, 2, 6), D(2026, 4, 20), D(2026, 4, 29), 2800, "Character walk cycles", "In Progress");
  add("Forge Creative", "VFX", BQ(2026, 2, 7), D(2026, 4, 22), null, 1750, "Particle render queue", "Delayed");
  add("Harbor Lights", "Color Grading", BQ(2026, 2, 7), D(2026, 4, 24), D(2026, 4, 29), 380, "Final LUT prep", "Completed");

  return rows;
}

export const MOCK_JOBS = generateMockJobs();
