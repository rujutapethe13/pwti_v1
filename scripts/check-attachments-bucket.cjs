// Check if the 'attachments' storage bucket exists and is accessible.
// Reads through service_role so it bypasses RLS.
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing env vars");
  process.exit(1);
}

const db = createClient(url, key);

(async () => {
  // 1. List all buckets
  const { data: buckets, error: bucketsError } = await db.storage.listBuckets();
  if (bucketsError) {
    console.error("listBuckets failed:", bucketsError.message);
  } else {
    console.log("Buckets:", buckets.map((b) => b.id));
    const attachments = buckets.find((b) => b.id === "attachments");
    if (!attachments) {
      console.log("RESULT: 'attachments' bucket does NOT exist");
    } else {
      console.log("RESULT: 'attachments' bucket exists:", JSON.stringify(attachments));
    }
  }

  // 2. Try the actual upload path
  const testPath = "test/diagnostic-" + Date.now() + ".txt";
  const { error: uploadError } = await db.storage
    .from("attachments")
    .upload(testPath, "hello", { contentType: "text/plain", upsert: false });

  if (uploadError) {
    console.log("Upload error:", uploadError.message);
    console.log("Upload error code:", uploadError.code);
  } else {
    console.log("Upload succeeded, cleaning up...");
    await db.storage.from("attachments").remove([testPath]);
  }
})();