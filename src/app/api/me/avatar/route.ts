import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isMissingRelationError, writeProfile } from "@/lib/account-server";
import { initialsFromName, resolveFullName } from "@/lib/account-types";

/**
 * POST /api/me/avatar   (multipart: file)
 * DELETE /api/me/avatar (clear the photo)
 *
 * Uploads go to the `avatars` bucket under `<user_id>/<uuid>.<ext>`, so the
 * folder a file lands in is decided by the caller's own id rather than by
 * anything in the request. That is why the RLS policies on storage.objects can
 * be as narrow as "first path segment is auth.uid()".
 *
 * The previous photo is deleted only when it lives in our bucket — a URL
 * pointing anywhere else (an OAuth provider avatar, say) is left alone rather
 * than turned into a delete against a path we do not own.
 */

const MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

/** The path prefix this user owns. Anything else is not ours to delete. */
function ownPrefix(userId: string) {
  return `${userId}/`;
}

function isOwnAvatar(url: string | null, userId: string): boolean {
  if (!url) return false;
  const marker = "/object/public/avatars/";
  const index = url.indexOf(marker);
  if (index === -1) return false;
  return url.slice(index + marker.length).startsWith(ownPrefix(userId));
}

async function currentUser() {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

async function readCurrentAvatarUrl(userId: string): Promise<string | null> {
  const db = await createServiceClient();
  const { data } = await db
    .from("profiles")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();

  return (data?.avatar_url as string | null) ?? null;
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

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return fail("Profile photos must be a PNG, JPEG, WebP or GIF", 400);
  }

  if (file.size > MAX_BYTES) {
    return fail("Profile photos must be 2 MB or smaller", 400);
  }

  const userId = user.id;
  const db = await createServiceClient();

  const previous = await readCurrentAvatarUrl(userId);
  const objectPath = `${ownPrefix(userId)}${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await db.storage
    .from("avatars")
    .upload(objectPath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    if (isMissingRelationError(uploadError)) {
      return fail(
        "Avatar uploads are not available on this database yet. Apply supabase/migrations/20261005130000_account_settings_and_sessions.sql and try again.",
        503,
      );
    }
    console.error("[account] avatar upload failed:", uploadError.message);
    return fail("Could not upload the photo", 500);
  }

  const { data: publicData } = db.storage.from("avatars").getPublicUrl(objectPath);
  const avatarUrl = publicData.publicUrl;

  const written = await writeProfile(userId, { avatarUrl });
  if (!written.ok) {
    // Do not leave an orphaned object behind if the row could not be updated.
    await db.storage.from("avatars").remove([objectPath]);
    return fail("Could not save the photo", 500);
  }

  if (previous && isOwnAvatar(previous, userId)) {
    const marker = "/object/public/avatars/";
    await db.storage
      .from("avatars")
      .remove([previous.slice(previous.indexOf(marker) + marker.length)]);
  }

  const email = user.email ?? "";
  const fullName = resolveFullName(
    (user.user_metadata as { full_name?: string } | undefined)?.full_name,
    user.user_metadata as Record<string, unknown> | undefined,
    email,
  );

  return NextResponse.json({
    success: true,
    avatarUrl,
    initials: initialsFromName(fullName),
  });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return fail("Authentication required", 401);

  const userId = user.id;
  const previous = await readCurrentAvatarUrl(userId);

  const written = await writeProfile(userId, { avatarUrl: null });
  if (!written.ok) return fail("Could not remove the photo", 500);

  if (previous && isOwnAvatar(previous, userId)) {
    const marker = "/object/public/avatars/";
    const db = await createServiceClient();
    await db.storage
      .from("avatars")
      .remove([previous.slice(previous.indexOf(marker) + marker.length)]);
  }

  return NextResponse.json({ success: true, avatarUrl: null });
}