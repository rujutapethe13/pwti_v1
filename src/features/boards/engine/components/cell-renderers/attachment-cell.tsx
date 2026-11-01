"use client";

import { useCallback, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, Paperclip, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import type { ColumnValue } from "../../types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv";
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

export interface AttachmentFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  uploadedAt?: string;
  uploadedBy?: string;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return <ImageIcon className="size-4" />;
  }
  return <FileText className="size-4" />;
}

export function AttachmentCell({ value, readOnly, onChange }: CellRendererComponentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);

  const files = Array.isArray(value) ? (value as unknown as AttachmentFile[]) : [];

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_SIZE) {
      return `${file.name} exceeds 10MB limit`;
    }
    if (!ALLOWED_MIME_TYPES.has(file.type) && file.type !== "") {
      // Also check by extension as fallback
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ACCEPT.includes(ext)) {
        return `${file.name} has unsupported file type`;
      }
    }
    return null;
  };

  const uploadFile = useCallback(
    async (file: File): Promise<AttachmentFile | null> => {
      const validationError = validateFile(file);
      if (validationError) {
        toast.error(validationError);
        return null;
      }

      setUploading(true);
      setProgress(0);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();

        return new Promise((resolve) => {
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              setProgress(percent);
            }
          });

          xhr.addEventListener("load", () => {
            setUploading(false);
            setProgress(0);
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                const data = response.data || response;
                resolve({
                  id: data.id || crypto.randomUUID(),
                  name: data.name || file.name,
                  size: data.size || file.size,
                  mimeType: data.mimeType || file.type,
                  url: data.url,
                  uploadedAt: data.uploadedAt || new Date().toISOString(),
                  uploadedBy: data.uploadedBy,
                });
              } catch (e) {
                // Fallback to local object URL if API fails
                resolve({
                  id: crypto.randomUUID(),
                  name: file.name,
                  size: file.size,
                  mimeType: file.type,
                  url: URL.createObjectURL(file),
                  uploadedAt: new Date().toISOString(),
                });
              }
            } else {
              try {
                const error = JSON.parse(xhr.responseText);
                toast.error(error.error || "Upload failed");
              } catch {
                toast.error("Upload failed");
              }
              resolve(null);
            }
          });

          xhr.addEventListener("error", () => {
            setUploading(false);
            setProgress(0);
            toast.error("Upload failed");
            resolve(null);
          });

          xhr.open("POST", "/api/attachments/upload");
          xhr.send(formData);
        });
      } catch (error) {
        setUploading(false);
        setProgress(0);
        toast.error("Upload failed");
        return null;
      }
    },
    [],
  );

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      if (readOnly) return;
      const arr = Array.from(list);
      const uploadedFiles: AttachmentFile[] = [];

      for (const file of arr) {
        const uploaded = await uploadFile(file);
        if (uploaded) {
          uploadedFiles.push(uploaded);
        }
      }

      if (uploadedFiles.length > 0) {
        onChange?.([...(files as unknown[]), ...uploadedFiles] as unknown as ColumnValue);
      }
    },
    [readOnly, uploadFile, files, onChange],
  );

  const remove = useCallback(
    (id: string) => {
      if (readOnly) return;
      onChange?.((files as AttachmentFile[]).filter((f) => f.id !== id) as unknown as ColumnValue);
    },
    [readOnly, files, onChange],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (readOnly) return;
      inputRef.current?.click();
    },
    [readOnly],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!readOnly) {
        setIsDragging(true);
      }
    },
    [readOnly],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (readOnly) return;
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [readOnly, addFiles],
  );

  const handlePreview = useCallback((file: AttachmentFile) => {
    if (file.mimeType.startsWith("image/") || file.mimeType === "application/pdf") {
      setPreviewUrl(file.url);
      setPreviewName(file.name);
    } else {
      window.open(file.url, "_blank");
    }
  }, []);

  const handleDownload = useCallback((file: AttachmentFile, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement("a");
    link.href = file.url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const displayFiles = files.slice(0, 2);
  const remainingCount = files.length > 2 ? files.length - 2 : 0;

  return (
    <div
      className="relative min-h-[28px] w-full group"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            addFiles(e.target.files);
          }
          e.target.value = "";
        }}
      />

      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClick}
          className="absolute right-1 top-1 h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100 z-10"
          aria-label="Attach file"
        >
          <Plus className="size-3.5" />
        </Button>
      )}

      <div
        className={`flex flex-wrap items-center gap-1 min-h-[28px] ${isDragging ? "ring-2 ring-primary ring-inset rounded" : ""}`}
      >
        {files.length === 0 ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground w-full">
            {!readOnly && (
              <button
                type="button"
                onClick={handleClick}
                className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
                aria-label="Add attachment"
              >
                <Paperclip className="size-3" />
                <span>Add</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {displayFiles.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-xs max-w-[140px]"
                title={f.name}
              >
                {f.mimeType.startsWith("image/") ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(f);
                    }}
                    className="flex items-center gap-1 min-w-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={f.name} className="size-5 object-cover rounded flex-shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(f);
                    }}
                    className="flex items-center gap-1 min-w-0"
                  >
                    {getFileIcon(f.mimeType)}
                    <span className="truncate">{f.name}</span>
                  </button>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(f.id);
                    }}
                    aria-label="Remove"
                    className="hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => handleDownload(f, e)}
                    aria-label="Download"
                    className="hover:text-primary"
                  >
                    <Download className="size-3" />
                  </button>
                )}
              </div>
            ))}
            {remainingCount > 0 && (
              <span className="text-xs text-muted-foreground px-1">+{remainingCount}</span>
            )}
          </>
        )}
      </div>

      {uploading && (
        <div className="text-xs text-muted-foreground mt-1">
          Uploading... {progress}%
        </div>
      )}

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          {previewUrl && previewName && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b">
                <h3 className="text-sm font-medium truncate">{previewName}</h3>
              </div>
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
                {previewUrl.toLowerCase().includes(".pdf") || previewName.toLowerCase().endsWith(".pdf") ? (
                  <iframe src={previewUrl} className="w-full h-[70vh]" title={previewName} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt={previewName} className="max-w-full max-h-full object-contain" />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
