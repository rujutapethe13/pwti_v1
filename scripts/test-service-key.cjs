// Test service role key from .env.local file
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    env[key] = value;
  }
  return env;
}

const env = loadEnvFile(path.join(__dirname, "..", ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const svcKey = env.SUPABASE_SERVICE_ROLE_KEY;

console.log("URL:", url);
console.log("Service key length:", svcKey.length);
console.log("Service key prefix:", svcKey.substring(0, 30) + "...");

const db = createClient(url, svcKey, { auth: { persistSession: false } });

(async () => {
  // 1. Test DB query
  const { data, error: dbError } = await db.from("profiles").select("id").limit(1);
  console.log("\nDB query:", dbError ? `ERROR: ${dbError.message}` : `OK: ${data?.length} rows`);

  // 2. List buckets
  const { data: buckets, error: bucketsError } = await db.storage.listBuckets();
  if (bucketsError) {
    console.log("listBuckets error:", bucketsError.message);
  } else {
    console.log("\nBuckets:", buckets.map((b) => b.id));
    const attachments = buckets.find((b) => b.id === "attachments");
    if (!attachments) {
      console.log("RESULT: 'attachments' bucket does NOT exist");
    } else {
      console.log("RESULT: 'attachments' bucket exists:", JSON.stringify(attachments));
    }
  }

  // 3. Try upload to attachments bucket
  const testPath = "test/diagnostic-" + Date.now() + ".txt";
  const { error: uploadError } = await db.storage
    .from("attachments")
    .upload(testPath, "hello", { contentType: "text/plain", upsert: false });

  if (uploadError) {
    console.log("\nUpload error:", uploadError.message);
    console.log("Upload error code:", uploadError.code);
  } else {
    console.log("\nUpload succeeded! Cleaning up...");
    await db.storage.from("attachments").remove([testPath]);
  }
})();