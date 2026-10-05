"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { columnTypeRegistry } from "@/features/boards/engine/column-registry";
import type { ColumnTypeKey, ColumnValue } from "@/features/boards/engine/types";
import {
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ROWS,
  parseFile,
  validateImportFile,
  type ParsedFile,
  type FileValidationError,
} from "@/features/boards/engine/lib/import-export";
import {
  detectAllColumnTypes,
  detectColumnType,
  formatCellByColumnType,
  type DetectedColumnSchema,
} from "@/features/boards/engine/lib/column-type-detection";
import { ColumnTypeSelector } from "./column-type-selector";

export interface ImportColumn {
  id: string;
  name: string;
  type: ColumnTypeKey;
}

export interface ImportRecord {
  id: string;
  title: string;
  cells: Record<string, ColumnValue>;
}

export interface BoardSchema {
  columns: Array<{ id: string; name: string; type: ColumnTypeKey }>;
  records: ImportRecord[];
}

export interface ImportWizardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardName?: string;
  onConfirm: (schema: BoardSchema) => void | Promise<void>;
}

type Step = 1 | 2 | 3;

interface ParsedSheet {
  headers: string[];
  rows: Array<Record<string, ColumnValue>>;
  totalRowCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PREVIEW_ROW_COUNT = 8;

function parseSheet(file: File): Promise<ParsedSheet> {
  return parseFile(file).then((p) => ({
    headers: p.headers,
    rows: p.rows,
    totalRowCount: p.totalRowCount,
  }));
}

export function ImportWizardModal({
  open,
  onOpenChange,
  boardName,
  onConfirm,
}: ImportWizardModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [fileError, setFileError] = useState<FileValidationError | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [headerRowOffset, setHeaderRowOffset] = useState(0);
  const [titleColumnIndex, setTitleColumnIndex] = useState<string | null>(null);
  const [columnTypes, setColumnTypes] = useState<Record<string, ColumnTypeKey>>({});
  const [creating, setCreating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setParsed(null);
      setFileName("");
      setParsing(false);
      setFileError(null);
      setParseError(null);
      setHeaderRowOffset(0);
      setTitleColumnIndex(null);
      setColumnTypes({});
      setCreating(false);
    }
  }, [open]);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setParseError(null);
    setFileError(null);
    const validation = validateImportFile(file);
    if (validation) {
      setFileError(validation);
      return;
    }
    setParsing(true);
    try {
      const result = await parseSheet(file);
      setParsed(result);
      setHeaderRowOffset(0);

      const detected = detectAllColumnTypes(result.rows, result.headers);
      const initialTypes: Record<string, ColumnTypeKey> = {};
      for (const d of detected) {
        initialTypes[d.header] = d.type;
      }
      setColumnTypes(initialTypes);

      const titleCol = detected.find(
        (d) => d.type === "text" || d.type === "person" || d.type === "email",
      );
      if (titleCol) {
        setTitleColumnIndex(titleCol.header);
      } else if (detected.length > 0) {
        setTitleColumnIndex(detected[0].header);
      }

      setStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read file.";
      if (message.toLowerCase().includes("too many rows")) {
        setFileError({
          code: "too_many_rows",
          message: `File has too many rows. Maximum is ${MAX_IMPORT_ROWS.toLocaleString()}.`,
        });
      } else {
        setFileError({ code: "read_failed", message });
      }
    } finally {
      setParsing(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  const [dragOver, setDragOver] = useState(false);
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const effectiveHeaders = useMemo(() => {
    if (!parsed) return [] as string[];
    return parsed.headers;
  }, [parsed]);

  const previewRows = useMemo(() => {
    if (!parsed) return [] as Array<Record<string, ColumnValue>>;
    const maxRows = Math.min(parsed.rows.length, Math.max(PREVIEW_ROW_COUNT, headerRowOffset + PREVIEW_ROW_COUNT));
    return parsed.rows.slice(0, maxRows);
  }, [parsed, headerRowOffset]);

  const detectedSchemas = useMemo<DetectedColumnSchema[]>(() => {
    if (!parsed) return [];
    return detectAllColumnTypes(previewRows, effectiveHeaders);
  }, [parsed, previewRows, effectiveHeaders]);

  const updateColumnType = useCallback((header: string, type: ColumnTypeKey) => {
    setColumnTypes((prev) => ({ ...prev, [header]: type }));
  }, []);

  function columnDisplayName(header: string): string {
    return header;
  }

  function buildBoardSchema(): BoardSchema {
    if (!parsed) throw new Error("No parsed data");

    const columns: ImportColumn[] = effectiveHeaders.map((h, idx) => ({
      id: `col-${idx}`,
      name: columnDisplayName(h),
      type: columnTypes[h] ?? "text",
    }));

    const headerToColumnId = new Map(effectiveHeaders.map((h, idx) => [h, `col-${idx}`]));

    const titleHeader = titleColumnIndex ?? effectiveHeaders[0];
    const titleColumnId = headerToColumnId.get(titleHeader) ?? columns[0]?.id ?? "col-0";

    const records: ImportRecord[] = parsed.rows.map((row, rowIdx) => {
      const cells: Record<string, ColumnValue> = {};
      for (const header of effectiveHeaders) {
        const colId = headerToColumnId.get(header);
        if (!colId) continue;
        const col = columns.find((c) => c.id === colId);
        if (!col) continue;
        const raw = row[header];
        const coerced = coerceForImport(raw, col.type);
        cells[colId] = coerced;
      }
      const titleVal = cells[titleColumnId];
      const title =
        typeof titleVal === "string" && titleVal.length > 0
          ? titleVal
          : `Imported row ${rowIdx + 1}`;
      return { id: `rec-${rowIdx}`, title, cells };
    });

    return {
      columns: columns.map((c) => ({ id: c.id, name: c.name, type: c.type })),
      records,
    };
  }

  function coerceForImport(raw: ColumnValue, type: ColumnTypeKey): ColumnValue {
    if (raw === null || raw === undefined || raw === "") return null;
    switch (type) {
      case "number":
      case "currency":
      case "rating":
      case "progress": {
        if (typeof raw === "number") return raw;
        const cleaned = String(raw).replace(/[, $€£¥₹]/g, "");
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : null;
      }
      case "date":
      case "timeline":
        return String(raw);
      case "checkbox": {
        if (typeof raw === "boolean") return raw;
        const lower = String(raw).toLowerCase().trim();
        return lower === "true" || lower === "yes" || lower === "1" || lower === "y";
      }
      case "tags":
      case "multi_select":
        if (Array.isArray(raw)) return raw.map(String);
        return String(raw)
          .split(/[;,|]/)
          .map((s) => s.trim())
          .filter(Boolean);
      default:
        return typeof raw === "string" ? raw : String(raw);
    }
  }

  const handleConfirm = useCallback(() => {
    const schema = buildBoardSchema();
    void onConfirm(schema);
  }, [parsed, effectiveHeaders, columnTypes, titleColumnIndex, onConfirm]);

  const maxMb = (MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[90vw] max-w-none max-h-[85vh] flex-col gap-0 p-0">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="size-5 text-muted-foreground" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Import from {boardName ?? "a board"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {fileName
                    ? `${fileName} · ${parsed?.totalRowCount.toLocaleString() ?? 0} rows · ${effectiveHeaders.length} columns`
                    : "Upload a spreadsheet to get started"}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Step indicator */}
          <StepProgressIndicator step={step} parsed={!!parsed} />

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Live preview */}
            <div className="flex-1 overflow-auto border-r border-border p-4">
              {step === 1 && parsed && (
                <PreviewTable
                  headers={effectiveHeaders}
                  rows={previewRows}
                  headerRowOffset={headerRowOffset}
                  highlightedRowIndex={0}
                  columnTypes={columnTypes}
                  effectiveHeaders={effectiveHeaders}
                />
              )}
              {step === 2 && parsed && (
                <PreviewTable
                  headers={effectiveHeaders}
                  rows={previewRows}
                  highlightColumn={titleColumnIndex}
                  highlightedRowIndex={headerRowOffset}
                  columnTypes={columnTypes}
                  effectiveHeaders={effectiveHeaders}
                />
              )}
              {step === 3 && parsed && (
                <PreviewTable
                  headers={effectiveHeaders}
                  rows={previewRows}
                  highlightedRowIndex={headerRowOffset}
                  columnTypes={columnTypes}
                  effectiveHeaders={effectiveHeaders}
                  formattedPreview
                />
              )}
              {!parsed && (
                <UploadZone
                  dragOver={dragOver}
                  parsing={parsing}
                  fileName={fileName}
                  fileError={fileError}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onInputChange={handleInputChange}
                  onBrowseClick={() => fileInputRef.current?.click()}
                  fileInputRef={fileInputRef}
                  maxMb={maxMb}
                  maxRows={MAX_IMPORT_ROWS}
                />
              )}
            </div>

            {/* Right: Step controls */}
            <div className="w-80 shrink-0 overflow-y-auto border-l border-border bg-muted/30 p-6">
              {step === 1 && !parsed && (
                <UploadZone
                  dragOver={dragOver}
                  parsing={parsing}
                  fileName={fileName}
                  fileError={fileError}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onInputChange={handleInputChange}
                  onBrowseClick={() => fileInputRef.current?.click()}
                  fileInputRef={fileInputRef}
                  maxMb={maxMb}
                  maxRows={MAX_IMPORT_ROWS}
                />
              )}

              {step === 1 && parsed && (
                <Step1FirstRow
                  headers={effectiveHeaders}
                  previewRows={previewRows}
                  headerRowOffset={headerRowOffset}
                  onOffsetChange={setHeaderRowOffset}
                />
              )}

              {step === 2 && parsed && (
                <Step2FirstColumn
                  headers={effectiveHeaders}
                  titleColumnIndex={titleColumnIndex}
                  onTitleColumnChange={setTitleColumnIndex}
                  detected={detectedSchemas}
                />
              )}

              {step === 3 && parsed && (
                <Step3CustomizeColumns
                  headers={effectiveHeaders}
                  columnTypes={columnTypes}
                  detected={detectedSchemas}
                  rows={previewRows}
                  onTypeChange={updateColumnType}
                />
              )}
            </div>
          </div>

          {/* Footer */}
          <StepFooter
            step={step}
            parsed={!!parsed}
            creating={creating}
            onBack={() => setStep(step > 1 ? (step - 1) as Step : step)}
            onNext={() => {
              if (step < 3) setStep((step + 1) as Step);
            }}
            onConfirm={handleConfirm}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Step progress indicator ────────────────────────────────── */

function StepProgressIndicator({
  step,
  parsed,
}: {
  step: Step;
  parsed: boolean;
}) {
  const steps = [
    { num: 1, label: "What is your first row?" },
    { num: 2, label: "What is your first column?" },
    { num: 3, label: "Customize your columns" },
  ] as const;

  return (
    <div className="flex items-center justify-center gap-2 border-b border-border px-6 py-3 text-xs">
      {steps.map((s, idx) => (
        <div key={s.num} className="flex items-center gap-1.5">
          <div
            className={cn(
              "flex size-6 items-center justify-center rounded-full border text-xs font-medium",
              s.num === step
                ? "border-primary bg-primary text-primary-foreground"
                : s.num < step
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
            )}
          >
            {s.num}
          </div>
          <span className={cn("text-xs", s.num === step && "font-medium text-foreground")}>
            Step {s.num} of 3
          </span>
          <span className="text-xs text-muted-foreground">{s.label}</span>
          {idx < steps.length - 1 && <span className="mx-1 text-muted-foreground/40">→</span>}
        </div>
      ))}
    </div>
  );
}

/* ── Preview table ──────────────────────────────────────────── */

interface PreviewTableProps {
  headers: string[];
  rows: Array<Record<string, ColumnValue>>;
  headerRowOffset: number;
  highlightedRowIndex?: number;
  highlightColumn?: string | null;
  columnTypes: Record<string, ColumnTypeKey>;
  effectiveHeaders: string[];
  formattedPreview?: boolean;
}

function PreviewTable({
  headers,
  rows,
  headerRowOffset,
  highlightedRowIndex,
  highlightColumn,
  columnTypes,
  formattedPreview,
}: PreviewTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="min-w-full table-auto text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium text-foreground last:border-r-0">
              #
            </th>
            {headers.map((h) => (
              <th
                key={h}
                className={cn(
                  "border-b border-r border-border px-2 py-1.5 text-left font-medium text-foreground last:border-r-0",
                  highlightColumn === h && "ring-2 ring-primary",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isHeaderRow = idx === headerRowOffset;
            const isHighlightRow = highlightedRowIndex !== undefined && idx === highlightedRowIndex;
            return (
              <tr
                key={idx}
                className={cn(
                  "odd:bg-white even:bg-muted/10",
                  isHeaderRow && "bg-primary/5 font-medium",
                  isHighlightRow && "ring-2 ring-primary",
                )}
              >
                <td className="border-b border-r border-border px-2 py-1.5 text-left text-muted-foreground last:border-r-0">
                  {idx + headerRowOffset + 1}
                </td>
                {headers.map((h) => {
                  const type = columnTypes[h] ?? "text";
                  let display: string;
                  if (formattedPreview && type !== "text" && type !== "long_text") {
                    display = formatCellByColumnType(row[h], type) ?? "—";
                  } else {
                    const v = row[h];
                    display = v === null || v === undefined || v === "" ? "—" : String(v);
                  }
                  return (
                    <td
                      key={h}
                      className={cn(
                        "border-b border-r border-border px-2 py-1.5 text-foreground/80 last:border-r-0",
                        isHeaderRow && "font-medium text-foreground",
                        highlightColumn === h && "ring-1 ring-primary",
                      )}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Step 1 — First row ──────────────────────────────────────── */

function Step1FirstRow({
  headers,
  previewRows,
  headerRowOffset,
  onOffsetChange,
}: {
  headers: string[];
  previewRows: Array<Record<string, ColumnValue>>;
  headerRowOffset: number;
  onOffsetChange: (offset: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">What is your first row?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Confirm which row of your sheet becomes the column headers. The selected
          row is highlighted in the preview table.
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs">
          <span className="font-medium text-foreground">Header row</span>
        </label>
        <select
          value={headerRowOffset}
          onChange={(e) => onOffsetChange(Number(e.target.value))}
          className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
        >
          {previewRows.map((_, idx) => (
            <option key={idx} value={idx}>
              Row {idx + 1} — {String(previewRows[idx][headers[0]] ?? "").slice(0, 30) || "(empty)"}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs text-muted-foreground">
        Preview uses rows {headerRowOffset + 1} onward as data. Headers
        detected from row {headerRowOffset + 1}.
      </div>
    </div>
  );
}

/* ── Step 2 — First column ───────────────────────────────────── */

function Step2FirstColumn({
  headers,
  titleColumnIndex,
  onTitleColumnChange,
  detected,
}: {
  headers: string[];
  titleColumnIndex: string | null;
  onTitleColumnChange: (h: string | null) => void;
  detected: DetectedColumnSchema[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">What is your first column?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Confirm which column becomes the row titles — the primary "name" field
          for each item. The selected column is highlighted in the preview.
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs">
          <span className="font-medium text-foreground">Title column</span>
        </label>
        <select
          value={titleColumnIndex ?? ""}
          onChange={(e) => onTitleColumnChange(e.target.value || null)}
          className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">— Generate titles automatically —</option>
          {headers.map((h) => {
            const det = detected.find((d) => d.header === h);
            return (
              <option key={h} value={h}>
                {h} {det ? `· ${det.type}` : ""}
              </option>
            );
          })}
        </select>
      </div>

      <div className="text-xs text-muted-foreground">
        {titleColumnIndex
          ? `Column "${titleColumnIndex}" will be used as the item name.`
          : "Titles will be auto-generated (e.g., \"Imported row 1\")."}
      </div>
    </div>
  );
}

/* ── Step 3 — Customize columns ──────────────────────────────── */

function Step3CustomizeColumns({
  headers,
  columnTypes,
  detected,
  rows,
  onTypeChange,
}: {
  headers: string[];
  columnTypes: Record<string, ColumnTypeKey>;
  detected: DetectedColumnSchema[];
  rows: Array<Record<string, ColumnValue>>;
  onTypeChange: (header: string, type: ColumnTypeKey) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Customize your columns</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Assign a type to each column. Types are auto-detected based on your
          data — the sparkle icon reverts to the auto-detected type.
        </p>
      </div>

      <div className="space-y-2">
        {headers.map((h) => {
          const det = detected.find((d) => d.header === h);
          const currentType = columnTypes[h] ?? "text";
          return (
            <div key={h} className="flex items-center gap-2 rounded-md border border-border bg-white p-2">
              <div className="w-36 shrink-0 truncate text-xs font-medium text-foreground" title={h}>
                {h}
              </div>
              <div className="flex-1">
                <ColumnTypeSelector
                  values={rows.map((r) => r[h])}
                  selectedType={currentType}
                  onChange={(type) => onTypeChange(h, type)}
                />
                {det && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    Auto: {columnTypeRegistry[det.type]?.label ?? det.type}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Upload zone ─────────────────────────────────────────────── */

interface UploadZoneProps {
  dragOver: boolean;
  parsing: boolean;
  fileName: string;
  fileError: FileValidationError | null;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBrowseClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  maxMb: string;
  maxRows: number;
}

function UploadZone({
  dragOver,
  parsing,
  fileName,
  fileError,
  onDrop,
  onDragOver,
  onDragLeave,
  onInputChange,
  onBrowseClick,
  fileInputRef,
  maxMb,
  maxRows,
}: UploadZoneProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-center transition-colors",
          dragOver && "border-primary bg-primary/5",
          fileError && "border-destructive/50 bg-destructive/5",
        )}
      >
        {parsing ? (
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        ) : (
          <UploadCloud className="size-8 text-muted-foreground" />
        )}
        <div className="text-sm font-medium text-foreground">
          {parsing ? "Reading file…" : fileName ? `Selected: ${fileName}` : "Drag and drop your file here"}
        </div>
        <div className="text-xs text-muted-foreground">
          or click the button below to browse from your computer
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={onBrowseClick}
          disabled={parsing}
        >
          Browse files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onInputChange}
          className="hidden"
          disabled={parsing}
        />
        <div className="mt-2 text-[10px] text-muted-foreground">
          .xlsx, .xls, .csv · up to {maxMb} MB · max {maxRows.toLocaleString()} rows
        </div>
      </div>
      {fileError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span>{fileError.message}</span>
        </div>
      )}
    </div>
  );
}

/* ── Step footer ─────────────────────────────────────────────── */

function StepFooter({
  step,
  parsed,
  creating,
  onBack,
  onNext,
  onConfirm,
}: {
  step: Step;
  parsed: boolean;
  creating: boolean;
  onBack: () => void;
  onNext: () => void;
  onConfirm: () => void;
}) {
  const isLastStep = step === 3;

  return (
    <div className="flex items-center justify-between border-t border-border px-6 py-4">
      <Button variant="ghost" size="sm" onClick={onBack} disabled={!parsed || step === 1}>
        <ChevronLeft className="mr-1 size-3.5" />
        Back
      </Button>

      {creating ? (
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Loader2 className="size-4 animate-spin" />
          Creating board…
        </div>
      ) : isLastStep ? (
        <Button size="sm" onClick={onConfirm} disabled={!parsed}>
          Create Board
          <ChevronRight className="ml-1 size-3.5" />
        </Button>
      ) : (
        <Button size="sm" onClick={onNext} disabled={!parsed}>
          Next
          <ChevronRight className="ml-1 size-3.5" />
        </Button>
      )}
    </div>
  );
}

export { formatBytes };
