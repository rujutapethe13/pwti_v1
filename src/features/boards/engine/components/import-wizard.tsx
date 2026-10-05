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
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { columnTypeRegistry } from "@/features/boards/engine/column-registry";
import type {
  ColumnDefinition,
  ColumnTypeKey,
  ColumnValue,
  Group,
} from "@/features/boards/engine/types";
import {
  applyOptionMappingsToColumns,
  buildInitialMappings,
  buildNewColumnsFromMappings,
  buildRecordFromRow,
  CREATABLE_IMPORT_TYPES,
  findBestTitleColumn,
  findUnmatchedOptions,
  getColumnIdsToDelete,
  getMappedExistingColumnIds,
  getMappableMappings,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ROWS,
  parseFile,
  PREVIEW_ROW_COUNT,
  suggestColumnMapping,
  validateImportFile,
  validateMappings,
} from "@/features/boards/engine/lib/import-export";
import type {
  ColumnMapping,
  FileValidationError,
  OptionMapping,
  ParsedFile,
} from "@/features/boards/engine/lib/import-export";

/* ─────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────── */

export interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardName: string;
  columns: ColumnDefinition[];
  groups: Group[];
  onConfirm: (args: {
    newColumns: ColumnDefinition[];
    updatedColumns: ColumnDefinition[];
    records: Array<{ title: string; cellValues: Record<string, ColumnValue> }>;
    skippedRows: Array<{ rowIndex: number; reason: string; rawRow: Record<string, ColumnValue> }>;
    columnsToDelete: string[];
    targetGroupId: string | null;
  }) => Promise<{ createdCount: number; importErrors: Array<{ rowIndex: number; reason: string }> }> | { createdCount: number; importErrors: Array<{ rowIndex: number; reason: string }> };
}

type Step = "upload" | "preview" | "mapping" | "creating" | "summary";

interface ImportSummary {
  created: number;
  skipped: Array<{ rowIndex: number; reason: string; rawRow: Record<string, ColumnValue> }>;
  importErrors: Array<{ rowIndex: number; reason: string }>;
}

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ─────────────────────────────────────────────────────────────
 * Component
 * ───────────────────────────────────────────────────────────── */

export function ImportWizard({
  open,
  onOpenChange,
  boardName,
  columns,
  groups,
  onConfirm,
}: ImportWizardProps) {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<FileValidationError | null>(null);
  const [parsing, setParsing] = useState(false);

  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [newColumns, setNewColumns] = useState<ColumnDefinition[]>([]);
  const [titleColumnFileHeader, setTitleColumnFileHeader] = useState<string | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(
    groups[0]?.id ?? null,
  );
  const [optionMappings, setOptionMappings] = useState<
    Record<string, Record<string, OptionMapping>>
  >({});

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mappableMappings = useMemo(
    () => getMappableMappings(mappings, titleColumnFileHeader),
    [mappings, titleColumnFileHeader],
  );
  const columnsToDelete = useMemo(
    () =>
      getColumnIdsToDelete(
        columns,
        getMappedExistingColumnIds(mappings),
      ),
    [columns, mappings],
  );

  // Reset state whenever the dialog is closed so the next open is clean.
  useEffect(() => {
    if (!open) {
      setStep("upload");
      setParsed(null);
      setFileName("");
      setParseError(null);
      setFileError(null);
      setParsing(false);
      setMappings([]);
      setNewColumns([]);
      setTitleColumnFileHeader(null);
      setTargetGroupId(groups[0]?.id ?? null);
      setOptionMappings({});
      setImporting(false);
      setImportProgress({ done: 0, total: 0 });
      setSummary(null);
    }
  }, [open, groups]);

  /* ── File ingestion ──────────────────────────────────────── */

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
      const result = await parseFile(file);
      setParsed(result);
      console.warn("[IMPORT] stage=parse", {
        fileName: file.name,
        headers: result.headers,
        rowCount: result.rows.length,
        totalRowCount: result.totalRowCount,
        sampleRows: result.rows.slice(0, 5),
      });
      const initialMappings = buildInitialMappings(result.headers, columns);
      setMappings(initialMappings);
      console.warn("[IMPORT] stage=mapping", {
        headers: result.headers,
        mappings: initialMappings,
      });
      setNewColumns([]);
      setTitleColumnFileHeader(
        findBestTitleColumn(result.headers, columns),
      );
      setOptionMappings({});
      setStep("preview");
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
  }, [columns]);

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

  /* ── Mapping updates ─────────────────────────────────────── */

  const updateMapping = useCallback(
    (id: string, patch: (m: ColumnMapping) => ColumnMapping) => {
      setMappings((prev) =>
        prev.map((m) => (m.id === id ? patch(m) : m)),
      );
    },
    [],
  );

  const setMappingSkip = useCallback(
    (id: string) => {
      updateMapping(id, (m) => ({ ...m, action: { kind: "skip" } }));
    },
    [updateMapping],
  );

  const setMappingExisting = useCallback(
    (id: string, columnId: string) => {
      updateMapping(id, (m) => ({
        ...m,
        action: { kind: "existing", columnId },
      }));
    },
    [updateMapping],
  );

  const setMappingCreate = useCallback(
    (id: string, type: ColumnTypeKey, label: string) => {
      updateMapping(id, (m) => ({
        ...m,
        action: { kind: "create", type, label },
      }));
    },
    [updateMapping],
  );

  // Re-derive new columns when mappings change.
  useEffect(() => {
    const built = buildNewColumnsFromMappings(
      "preview-board",
      mappableMappings,
      columns.length,
      columns,
    );
    setNewColumns(built);
  }, [mappableMappings, columns.length, columns]);

  const validation = useMemo(
    () => validateMappings(mappableMappings, columns, newColumns),
    [mappableMappings, columns, newColumns],
  );

  const unmatchedOptions = useMemo(() => {
    if (!parsed) return {};
    return findUnmatchedOptions(parsed.rows, mappableMappings, columns);
  }, [parsed, mappableMappings, columns]);

  /* ── Option mapping updates (status / person / dropdown) ─── */

  const setOptionMapping = useCallback(
    (
      fileColumn: string,
      rawValue: string,
      patch: Partial<OptionMapping>,
    ) => {
      setOptionMappings((prev) => {
        const fileMap = { ...(prev[fileColumn] ?? {}) };
        const existing: OptionMapping = fileMap[rawValue] ?? {
          rawValue,
          targetLabel: rawValue,
          createNew: false,
        };
        fileMap[rawValue] = { ...existing, ...patch };
        return { ...prev, [fileColumn]: fileMap };
      });
    },
    [],
  );

  /* ── Bulk create ─────────────────────────────────────────── */

  const startImport = useCallback(async () => {
    if (!parsed) return;
    if (!validation.valid) return;
    setStep("creating");
    setImporting(true);
    setImportProgress({ done: 0, total: parsed.rows.length });

    const updatedExisting = applyOptionMappingsToColumns(
      columns,
      mappableMappings,
      optionMappings,
      parsed.rows,
    );
    const updatedNew = applyOptionMappingsToColumns(
      newColumns,
      mappableMappings,
      optionMappings,
      parsed.rows,
    );
    const updatedColumns = [...updatedExisting, ...updatedNew];
    const createdRecords: Array<{
      title: string;
      cellValues: Record<string, ColumnValue>;
    }> = [];
    const skipped: ImportSummary["skipped"] = [];

    for (let i = 0; i < parsed.rows.length; i += 1) {
      const row = parsed.rows[i];
      const built = buildRecordFromRow(
        row,
        i,
        mappableMappings,
        updatedColumns,
        titleColumnFileHeader,
        optionMappings,
      );
      // Required-field check: if any mapped column is marked required
      // and the row is empty, flag it.
      const missingRequired = mappableMappings.some((m) => {
        if (m.action.kind === "skip") return false;
        let col: ColumnDefinition | undefined;
        if (m.action.kind === "existing") {
          const id = m.action.columnId;
          col = columns.find((c) => c.id === id);
        } else {
          const createLabel = m.action.label;
          col = newColumns.find(
            (c) => c.label.trim().toLowerCase() === createLabel.trim().toLowerCase(),
          );
        }
        if (!col?.required) return false;
        const v = built.cellValues[col.id];
        return v === null || v === undefined || v === "";
      });
      if (missingRequired) {
        skipped.push({
          rowIndex: i,
          reason: "Missing required field",
          rawRow: row,
        });
      } else {
        createdRecords.push({
          title: built.recordTitle,
          cellValues: built.cellValues,
        });
      }
      setImportProgress({ done: i + 1, total: parsed.rows.length });
      // Yield to the UI every 25 rows so the progress bar updates.
      if (i % 25 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    console.warn("[IMPORT] stage=records-built", {
      recordCount: createdRecords.length,
      skippedCount: skipped.length,
      sampleRecords: createdRecords.slice(0, 5).map(({ title, cellValues }) => ({
        title,
        cellValueKeys: Object.keys(cellValues),
        cellValues,
      })),
    });

    try {
      const result = await onConfirm({
        newColumns,
        updatedColumns,
        records: createdRecords,
        skippedRows: skipped,
        columnsToDelete,
        targetGroupId,
      });
      setSummary({
        created: result.createdCount,
        skipped,
        importErrors: result.importErrors,
      });
      setStep("summary");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed.";
      setParseError(message);
      setStep("mapping");
    } finally {
      setImporting(false);
    }
  }, [
    parsed,
    validation.valid,
    columns,
    newColumns,
    mappableMappings,
    optionMappings,
    titleColumnFileHeader,
    columnsToDelete,
    targetGroupId,
    onConfirm,
  ]);

  const downloadSkipped = useCallback(() => {
    if (!summary || summary.skipped.length === 0) return;
    // Lightweight CSV download — no need to involve xlsx for this.
    const headers = parsed?.headers ?? [];
    const escape = (s: string) => {
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines: string[] = [];
    lines.push([...headers, "_skip_reason"].map(escape).join(","));
    for (const skip of summary.skipped) {
      lines.push(
        [
          ...headers.map((h) => escape(String(skip.rawRow[h] ?? ""))),
          escape(skip.reason),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skipped-rows-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [summary, parsed]);

  const reset = useCallback(() => {
    setStep("upload");
    setParsed(null);
    setFileName("");
    setParseError(null);
    setFileError(null);
    setMappings([]);
    setNewColumns([]);
    setTitleColumnFileHeader(null);
    setOptionMappings({});
    setSummary(null);
  }, []);

  /* ── Render helpers ──────────────────────────────────────── */

  const effectiveColumns = useMemo(
    () => [...columns, ...newColumns],
    [columns, newColumns],
  );

  const canProceedFromMapping = validation.valid && !importing;
  const maxMb = (MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);

  const modalMaxWidth = useMemo(() => {
    const colCount = parsed?.headers.length ?? 0;
    if (colCount > 12) return "max-w-[95vw]";
    if (colCount > 8) return "max-w-[85vw]";
    if (colCount > 5) return "max-w-4xl";
    return "max-w-3xl";
  }, [parsed?.headers.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`w-full ${modalMaxWidth} flex flex-col max-h-[85vh] overflow-hidden`}>
        <div className="shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-4" />
              Import into {boardName}
            </DialogTitle>
            <DialogDescription>
              Bring rows from a spreadsheet into this board. Supported formats: .xlsx, .xls, .csv.
            </DialogDescription>
          </DialogHeader>

          <StepIndicator step={step} />

          {parseError && step !== "creating" && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {step === "upload" && (
            <UploadStep
              fileError={fileError}
              fileName={fileName}
              parsing={parsing}
              dragOver={dragOver}
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

          {step === "preview" && parsed && (
            <PreviewStep parsed={parsed} fileName={fileName} />
          )}

          {step === "mapping" && parsed && (
            <MappingStep
              mappings={mappableMappings}
              allMappings={mappings}
              columns={effectiveColumns}
              existingColumns={columns}
              newColumns={newColumns}
              rows={parsed.rows}
              unmatchedOptions={unmatchedOptions}
              optionMappings={optionMappings}
              titleColumnFileHeader={titleColumnFileHeader}
              onTitleColumnChange={setTitleColumnFileHeader}
              onSetSkip={setMappingSkip}
              onSetExisting={setMappingExisting}
              onSetCreate={setMappingCreate}
              onSetOptionMapping={setOptionMapping}
              targetGroupId={targetGroupId}
              groups={groups}
              onTargetGroupChange={setTargetGroupId}
              validation={validation}
              onBack={() => setStep("preview")}
              onConfirm={startImport}
            />
          )}

        {step === "creating" && (
          <CreatingStep progress={importProgress} total={parsed?.totalRowCount ?? 0} />
        )}

        {step === "summary" && summary && (
          <SummaryStep
            summary={summary}
            onDownloadSkipped={downloadSkipped}
            onClose={() => onOpenChange(false)}
            onImportAnother={reset}
          />
        )}
        </div>

        <DialogFooter className="mt-2 shrink-0">
          {step === "upload" && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="ghost" onClick={() => setStep("upload")}>
                <ChevronLeft className="mr-1 size-3.5" />
                Back
              </Button>
              <Button onClick={() => setStep("mapping")}>
                Continue
                <ChevronRight className="ml-1 size-3.5" />
              </Button>
            </>
          )}
          {step === "mapping" && (
            <>
              <Button variant="ghost" onClick={() => setStep("preview")}>
                <ChevronLeft className="mr-1 size-3.5" />
                Back
              </Button>
              <Button onClick={startImport} disabled={!canProceedFromMapping}>
                Import {parsed?.totalRowCount ?? 0} row
                {(parsed?.totalRowCount ?? 0) === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step indicator
 * ───────────────────────────────────────────────────────────── */

function StepIndicator({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: "upload", label: "Upload" },
    { key: "preview", label: "Preview" },
    { key: "mapping", label: "Map columns" },
    { key: "creating", label: "Import" },
    { key: "summary", label: "Done" },
  ];
  const activeIdx = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {steps.map((s, idx) => (
        <div key={s.key} className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full border text-[10px] font-medium",
              idx < activeIdx && "border-primary bg-primary text-primary-foreground",
              idx === activeIdx && "border-primary text-primary",
              idx > activeIdx && "border-border text-muted-foreground",
            )}
          >
            {idx + 1}
          </span>
          <span className={cn(idx === activeIdx && "font-medium text-foreground")}>
            {s.label}
          </span>
          {idx < steps.length - 1 && <span className="mx-1 text-muted-foreground/50">→</span>}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step 1 — Upload
 * ───────────────────────────────────────────────────────────── */

interface UploadStepProps {
  fileError: FileValidationError | null;
  fileName: string;
  parsing: boolean;
  dragOver: boolean;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBrowseClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  maxMb: string;
  maxRows: number;
}

function UploadStep({
  fileError,
  fileName,
  parsing,
  dragOver,
  onDrop,
  onDragOver,
  onDragLeave,
  onInputChange,
  onBrowseClick,
  fileInputRef,
  maxMb,
  maxRows,
}: UploadStepProps) {
  return (
    <div className="space-y-3">
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
          {parsing
            ? "Reading file…"
            : fileName
              ? `Selected: ${fileName}`
              : "Drag and drop your file here"}
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
        />
        <div className="mt-2 text-[10px] text-muted-foreground">
          .xlsx, .xls, .csv · up to {maxMb} MB · max {maxRows.toLocaleString()} rows
        </div>
      </div>
      {fileError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{fileError.message}</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step 2 — Preview
 * ───────────────────────────────────────────────────────────── */

function PreviewStep({
  parsed,
  fileName,
}: {
  parsed: ParsedFile;
  fileName: string;
}) {
  const previewRows = parsed.rows.slice(0, PREVIEW_ROW_COUNT);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="size-3.5" />
          <span>{fileName}</span>
        </div>
        <span>
          {parsed.totalRowCount.toLocaleString()} row
          {parsed.totalRowCount === 1 ? "" : "s"} · {parsed.headers.length} column
          {parsed.headers.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="min-w-full table-auto text-xs">
          <thead className="bg-muted/40">
            <tr>
              {parsed.headers.map((h, i) => (
                <th
                  key={h + i}
                  className="border-b border-r border-border px-2 py-1.5 text-left font-medium text-foreground last:border-r-0"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, idx) => (
              <tr key={idx} className="odd:bg-white even:bg-muted/10">
                {parsed.headers.map((h, i) => (
                  <td
                    key={h + i}
                    className="border-b border-r border-border px-2 py-1.5 text-foreground/80 last:border-r-0"
                  >
                    {row[h] === null || row[h] === undefined || row[h] === ""
                      ? <span className="text-muted-foreground/60">—</span>
                      : String(row[h])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {parsed.totalRowCount > PREVIEW_ROW_COUNT && (
        <div className="text-xs text-muted-foreground">
          Showing the first {PREVIEW_ROW_COUNT} of {parsed.totalRowCount.toLocaleString()} rows.
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step 3 — Mapping
 * ───────────────────────────────────────────────────────────── */

interface MappingStepProps {
  mappings: ColumnMapping[];
  allMappings: ColumnMapping[];
  columns: ColumnDefinition[]; // effective (existing + new)
  existingColumns: ColumnDefinition[];
  newColumns: ColumnDefinition[];
  rows: Array<Record<string, ColumnValue>>;
  unmatchedOptions: Record<string, string[]>;
  optionMappings: Record<string, Record<string, OptionMapping>>;
  titleColumnFileHeader: string | null;
  onTitleColumnChange: (h: string | null) => void;
  onSetSkip: (id: string) => void;
  onSetExisting: (id: string, columnId: string) => void;
  onSetCreate: (id: string, type: ColumnTypeKey, label: string) => void;
  onSetOptionMapping: (
    fileColumn: string,
    rawValue: string,
    patch: Partial<OptionMapping>,
  ) => void;
  targetGroupId: string | null;
  groups: Group[];
  onTargetGroupChange: (id: string | null) => void;
  validation: ReturnType<typeof validateMappings>;
  onBack: () => void;
  onConfirm: () => void;
}

function MappingStep(props: MappingStepProps) {
  const {
    mappings,
    allMappings,
    columns,
    existingColumns,
    newColumns,
    rows,
    unmatchedOptions,
    optionMappings,
    titleColumnFileHeader,
    onTitleColumnChange,
    onSetSkip,
    onSetExisting,
    onSetCreate,
    onSetOptionMapping,
    targetGroupId,
    groups,
    onTargetGroupChange,
    validation,
  } = props;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        Map each column from your file to an existing board column, create a new one, or skip it.
        At least one column must be mapped.
      </div>

      {/* Title column + target group selector */}
      <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-white p-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-foreground">Title column (optional)</span>
          <select
            value={titleColumnFileHeader ?? ""}
            onChange={(e) => onTitleColumnChange(e.target.value || null)}
            className="h-7 rounded-md border border-input bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— Generate titles automatically —</option>
            {allMappings.map((m, i) => (
                <option key={m.fileColumn + i} value={m.fileColumn}>
                  {m.fileColumn}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-foreground">Target group</span>
          <select
            value={targetGroupId ?? ""}
            onChange={(e) => onTargetGroupChange(e.target.value || null)}
            className="h-7 rounded-md border border-input bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
          >
            {groups.length === 0 && <option value="">(No groups yet)</option>}
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Column mapping rows */}
      <div className="rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/40">
            <tr>
              <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium text-foreground">
                File column
              </th>
              <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium text-foreground">
                Map to
              </th>
              <th className="border-b border-r border-border px-2 py-1.5 text-left font-medium text-foreground">
                Type / Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m, i) => {
              let target: ColumnDefinition | null = null;
              if (m.action.kind === "existing") {
                const id = m.action.columnId;
                target = existingColumns.find((c) => c.id === id) ?? null;
              }
              return (
                <MappingRow
                  key={m.id}
                  mapping={m}
                  columns={columns}
                  existingColumns={existingColumns}
                  newColumns={newColumns}
                  target={target}
                  onSetSkip={() => onSetSkip(m.id)}
                  onSetExisting={(id) => onSetExisting(m.id, id)}
                  onSetCreate={(type, label) => onSetCreate(m.id, type, label)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Unmatched option review */}
      {Object.keys(unmatchedOptions).length > 0 && (
        <div className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-amber-900">
            <AlertCircle className="size-3.5" />
            Unmatched values detected
          </div>
          <div className="text-amber-900/80">
            These values from your file don&apos;t match any existing options. Map each one to an
            existing option, or auto-create new options.
          </div>
          <div className="unmatched-scroll-wrap relative">
            <div
              className="unmatched-scroll space-y-3 pr-1"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#fcd34d transparent" }}
            >
            {Object.entries(unmatchedOptions).map(([fileColumn, values]) => {
              const fileMap = optionMappings[fileColumn] ?? {};
              return (
                <div key={fileColumn} className="rounded border border-amber-200 bg-white p-2">
                  <div className="mb-1.5 font-medium text-foreground">{fileColumn}</div>
                  <div className="space-y-1">
                    {values.map((v) => {
                      const current = fileMap[v] ?? {
                        rawValue: v,
                        targetLabel: v,
                        createNew: true,
                      };
                      const existingLabels = getExistingOptionLabels(
                        mappings,
                        fileColumn,
                        columns,
                      );
                      return (
                        <div key={v} className="flex items-center gap-2">
                          <span className="w-32 truncate text-foreground/80" title={v}>
                            {v}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <select
                            value={
                              current.createNew
                                ? "__create__"
                                : (current.targetLabel ?? "")
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "__create__") {
                                onSetOptionMapping(fileColumn, v, {
                                  createNew: true,
                                  targetLabel: v,
                                });
                              } else {
                                onSetOptionMapping(fileColumn, v, {
                                  createNew: false,
                                  targetLabel: val,
                                });
                              }
                            }}
                            className="h-7 flex-1 rounded-md border border-input bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="__create__">+ Create new option &ldquo;{v}&rdquo;</option>
                            {existingLabels.map((label) => (
                              <option key={label} value={label}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
             })}
            </div>
          </div>
        </div>
      )}

      {validation.errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <ul className="list-disc pl-4">
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
          <ul className="list-disc pl-4">
            {validation.warnings.map((warn, i) => (
              <li key={i}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {validation.mappedCount} column{validation.mappedCount === 1 ? "" : "s"} mapped
        {validation.createCount > 0 &&
          ` · ${validation.createCount} new column${validation.createCount === 1 ? "" : "s"} will be created`}
        . {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"} will be imported.
      </div>
    </div>
  );
}

function getExistingOptionLabels(
  mappings: ColumnMapping[],
  fileColumn: string,
  columns: ColumnDefinition[],
): string[] {
  const m = mappings.find((mm) => mm.fileColumn === fileColumn);
  if (!m || m.action.kind !== "existing") return [];
  const targetId = m.action.columnId;
  const col = columns.find((c) => c.id === targetId);
  if (!col) return [];
  const opts = col.settings?.options;
  if (!Array.isArray(opts)) return [];
  return opts
    .map((o) => (typeof o === "string" ? o : (o as { label?: string }).label ?? null))
    .filter((s): s is string => typeof s === "string");
}

function MappingRow({
  mapping,
  columns,
  existingColumns,
  newColumns,
  target,
  onSetSkip,
  onSetExisting,
  onSetCreate,
}: {
  mapping: ColumnMapping;
  columns: ColumnDefinition[];
  existingColumns: ColumnDefinition[];
  newColumns: ColumnDefinition[];
  target: ColumnDefinition | null;
  onSetSkip: () => void;
  onSetExisting: (columnId: string) => void;
  onSetCreate: (type: ColumnTypeKey, label: string) => void;
}) {
  const suggestion = useMemo(
    () => suggestColumnMapping(mapping.fileColumn, existingColumns),
    [mapping.fileColumn, existingColumns],
  );

  return (
    <tr className="align-top">
      <td className="border-b border-r border-border px-2 py-2 font-medium text-foreground">
        {mapping.fileColumn}
      </td>
      <td className="border-b border-r border-border px-2 py-2">
        <select
          value={
            mapping.action.kind === "skip"
              ? "__skip__"
              : mapping.action.kind === "existing"
                ? mapping.action.columnId
                : "__create__"
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__skip__") onSetSkip();
            else if (v === "__create__") {
              onSetCreate("text", mapping.fileColumn);
            } else {
              onSetExisting(v);
            }
          }}
          className="h-7 w-full rounded-md border border-input bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="__skip__">— Skip —</option>
          <option value="__create__">+ Create new column…</option>
          {existingColumns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.type})
              {suggestion?.columnId === c.id ? " · suggested" : ""}
            </option>
          ))}
        </select>
      </td>
      <td className="border-b border-r border-border px-2 py-2">
        {mapping.action.kind === "skip" && (
          <span className="text-muted-foreground">Column will be ignored.</span>
        )}
        {mapping.action.kind === "existing" && target && (
          <span className="text-muted-foreground">
            Mapped to existing {target.type} column.
          </span>
        )}
        {mapping.action.kind === "create" && (() => {
          const createType = mapping.action.type;
          const createLabel = mapping.action.label;
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                value={createLabel}
                onChange={(e) => onSetCreate(createType, e.target.value)}
                placeholder="New column name"
                className="h-7 w-40 text-xs"
              />
              <select
                value={createType}
                onChange={(e) => onSetCreate(e.target.value as ColumnTypeKey, createLabel)}
                className="h-7 rounded-md border border-input bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              >
                {CREATABLE_IMPORT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {columnTypeRegistry[t].label}
                  </option>
                ))}
              </select>
            </div>
          );
        })()}
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step 4 — Creating (progress)
 * ───────────────────────────────────────────────────────────── */

function CreatingStep({
  progress,
  total,
}: {
  progress: { done: number; total: number };
  total: number;
}) {
  const pct = total > 0 ? Math.round((progress.done / total) * 100) : 0;
  return (
    <div className="space-y-3 py-4">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Loader2 className="size-4 animate-spin" />
        Creating items…
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {progress.done.toLocaleString()} of {total.toLocaleString()} rows processed
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step 5 — Summary
 * ───────────────────────────────────────────────────────────── */

function SummaryStep({
  summary,
  onDownloadSkipped,
  onClose,
  onImportAnother,
}: {
  summary: ImportSummary;
  onDownloadSkipped: () => void;
  onClose: () => void;
  onImportAnother: () => void;
}) {
  return (
    <div className="space-y-3 py-2">
      <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <div>
          <div className="font-medium">
            {summary.created.toLocaleString()} item
            {summary.created === 1 ? "" : "s"} created successfully
          </div>
          {summary.skipped.length > 0 && (
            <div className="text-xs text-emerald-900/80">
              {summary.skipped.length.toLocaleString()} row
              {summary.skipped.length === 1 ? "" : "s"} skipped due to errors
            </div>
          )}
          {summary.importErrors.length > 0 && (
            <div className="text-xs text-emerald-900/80">
              {summary.importErrors.length.toLocaleString()} row
              {summary.importErrors.length === 1 ? "" : "s"} failed to create
            </div>
          )}
        </div>
      </div>
      {summary.skipped.length > 0 && (
        <div className="rounded-md border border-border bg-muted/20 p-3 text-xs">
          <div className="mb-1.5 font-medium text-foreground">Skipped rows</div>
          <div className="mb-2 max-h-32 overflow-y-auto">
            {summary.skipped.map((s) => (
              <div key={s.rowIndex} className="flex items-center gap-2 py-0.5">
                <Trash2 className="size-3 text-muted-foreground" />
                <span>Row {s.rowIndex + 1}: {s.reason}</span>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={onDownloadSkipped}>
            Download skipped rows
          </Button>
        </div>
      )}
      {summary.importErrors.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="mb-1.5 font-medium">Import errors</div>
          <div className="max-h-40 overflow-y-auto">
            {summary.importErrors.map((e) => (
              <div key={e.rowIndex} className="flex items-center gap-2 py-0.5">
                <AlertCircle className="size-3 text-amber-600" />
                <span>Row {e.rowIndex + 1}: {e.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onImportAnother}>
          Import another file
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

export { formatBytes };
