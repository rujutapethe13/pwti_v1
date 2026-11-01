import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/account-server";

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
};

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

async function currentUser() {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail("Authentication required", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected a multipart upload", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail("No file was uploaded", 400);

  if (file.size > MAX_BYTES) {
    return fail(`${file.name} exceeds 10MB limit`, 400);
  }

  if (!ALLOWED_TYPES[file.type]) {
    // Try by extension
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "png", "jpg", "jpeg", "gif", "webp", "doc", "docx", "xls", "xlsx", "csv", "txt"].includes(ext)) {
      return fail(`${file.name} has unsupported file type`, 400);
    }
  }

  const db = await createServiceClient();
  const ext = ALLOWED_TYPES[file.type] || file.name.split(".").pop()?.toLowerCase() || "bin";
  const objectPath = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await db.storage
    .from("attachments")
    .upload(objectPath, file, { contentType: file.type || "application/octet-stream", upsert: false });

  if (uploadError) {
    const message = uploadError.message ?? "Unknown upload error";
    const code = (uploadError as { code?: string }).code ?? "UNKNOWN";

    if (isMissingRelationError(uploadError)) {
      return fail("Attachments bucket not configured. Create bucket 'attachments' in Supabase Storage.", 500);
    }

    // Surface the real error to the client so failures are diagnosable.
    console.error("[attachments] upload failed:", {
      code,
      message,
      name: file.name,
      size: file.size,
      contentType: file.type,
      objectPath,
      userId: user.id,
    });

    return fail(`${code}: ${message}`, 500);
  }

  const {
    data: { publicUrl },
  } = db.storage.from("attachments").getPublicUrl(objectPath);

  return NextResponse.json({
    success: true,
    data: {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      mimeType: file.type,
      url: publicUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.id,
    },
  });
}
