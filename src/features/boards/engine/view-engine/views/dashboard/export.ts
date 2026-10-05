"use client";

/**
 * Dashboard — Export utilities
 *
 * Client-side snapshot + download helpers used by the dashboard view.
 *
 *   • snapshotNode(node)         → HTMLCanvasElement (PNG-ready)
 *   • exportNodeAsPng(node, fn)  → triggers a PNG download
 *   • exportNodeAsPdf(node, fn)  → triggers a multi-page PDF download
 *   • exportSeriesAsCsv(series)  → triggers a CSV download
 *   • exportSeriesAsXlsx(series) → triggers an XLSX download
 *
 * The PDF export splits a tall dashboard into A4/Letter-sized pages by
 * computing the pixel slice of the rendered PNG that fits each page.
 *
 * Heavy dependencies (html2canvas, jspdf, xlsx) are loaded lazily inside
 * the first function that needs them, so they're tree-shaken out of the
 * initial dashboard bundle and only fetched when the user actually exports.
 */

import type { SeriesData } from "./chart-svg";
import { prepareNodeForExport } from "./export-colors";

export interface ExportProgress {
  /** 0..1 fractional progress; 1 means done. */
  progress: number;
  /** Human-readable status, e.g. "Rendering dashboard…". */
  status: string;
}

export type ProgressCallback = (p: ExportProgress) => void;

const PAGE_MARGIN_PX = 24;

function safeFileName(input: string): string {
  return input.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "") || "dashboard";
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a short delay so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function snapshotNode(
  node: HTMLElement,
  onProgress?: ProgressCallback,
): Promise<HTMLCanvasElement> {
  const [{ default: html2canvas }] = await Promise.all([import("html2canvas")]);
  onProgress?.({ progress: 0.1, status: "Preparing export…" });
  // Clone the node and inline-convert any oklch() colors to rgb so
  // html2canvas (which can't parse oklch) doesn't throw.
  const exportRoot = prepareNodeForExport(node);
  document.body.appendChild(exportRoot);
  let canvas: HTMLCanvasElement;
  try {
    onProgress?.({ progress: 0.2, status: "Rendering dashboard…" });
    canvas = await html2canvas(exportRoot, {
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
    });
  } finally {
    exportRoot.remove();
  }
  onProgress?.({ progress: 0.8, status: "Finalizing image…" });
  return canvas;
}

export async function exportNodeAsPng(
  node: HTMLElement,
  fileName: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const canvas = await snapshotNode(node, onProgress);
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) throw new Error("Failed to encode PNG");
  triggerDownload(blob, `${safeFileName(fileName)}.png`);
  onProgress?.({ progress: 1, status: "Done" });
}

export async function exportNodeAsPdf(
  node: HTMLElement,
  fileName: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  onProgress?.({ progress: 0.05, status: "Preparing export…" });
  const exportRoot = prepareNodeForExport(node);
  document.body.appendChild(exportRoot);
  let canvas: HTMLCanvasElement;
  try {
    onProgress?.({ progress: 0.2, status: "Rendering dashboard…" });
    canvas = await html2canvas(exportRoot, {
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
    });
  } finally {
    exportRoot.remove();
  }

  onProgress?.({ progress: 0.7, status: "Composing PDF…" });
  const pdf = new jsPDF({ unit: "px", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - PAGE_MARGIN_PX * 2;
  const usableH = pageH - PAGE_MARGIN_PX * 2;

  // Scale so the dashboard width fits a single page column.
  const ratio = usableW / canvas.width;
  const scaledTotalH = canvas.height * ratio;

  if (scaledTotalH <= usableH) {
    pdf.addImage(canvas, "PNG", PAGE_MARGIN_PX, PAGE_MARGIN_PX, usableW, scaledTotalH);
  } else {
    // Multi-page: slice the source PNG into page-height chunks and add each.
    const sliceHeightSrc = Math.floor(usableH / ratio);
    let y = 0;
    let first = true;
    while (y < canvas.height) {
      const h = Math.min(sliceHeightSrc, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = h;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Failed to create 2D context");
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      const imgH = h * ratio;
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(slice, "PNG", PAGE_MARGIN_PX, PAGE_MARGIN_PX, usableW, imgH);
      y += h;
      onProgress?.({
        progress: 0.7 + 0.25 * (y / canvas.height),
        status: "Composing PDF…",
      });
    }
  }

  pdf.save(`${safeFileName(fileName)}.pdf`);
  onProgress?.({ progress: 1, status: "Done" });
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportSeriesAsCsv(
  xLabels: string[],
  series: SeriesData[],
  fileName: string,
): void {
  const header = ["x", ...series.map((s) => s.name)];
  const rows = xLabels.map((label, i) => [
    label,
    ...series.map((s) => s.points[i]?.value ?? ""),
  ]);
  const csv = [header, ...rows].map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `${safeFileName(fileName)}.csv`);
}

export async function exportSeriesAsXlsx(
  xLabels: string[],
  series: SeriesData[],
  fileName: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const header = ["x", ...series.map((s) => s.name)];
  const rows = xLabels.map((label, i) => [
    label,
    ...series.map((s) => s.points[i]?.value ?? ""),
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Data");
  XLSX.writeFile(book, `${safeFileName(fileName)}.xlsx`);
}
