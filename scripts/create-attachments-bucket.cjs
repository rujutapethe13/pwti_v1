// Create the 'attachments' bucket via the Supabase Admin API.
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

const db = createClient(url, svcKey, { auth: { persistSession: false } });

(async () => {
  // Create bucket via the storage admin API
  const { data, error } = await db.storage.createBucket("attachments", {
    public: true,
    fileSizeLimit: 10485760, // 10MB
    allowedMimeTypes: [
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
    ],
  });

  if (error) {
    console.log("createBucket error:", error.message);
    // If already exists, try to update
    if (error.message.includes("already exists") || error.message.includes("duplicate")) {
      const { error: updateError } = await db.storage.updateBucket("attachments", {
        public: true,
        fileSizeLimit: 10485760,
        allowedMimeTypes: [
          "application/pdf", "image/png", "image/jpeg", "image/jpg",
          "image/gif", "image/webp", "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/csv", "text/plain",
        ],
      });
      if (updateError) {
        console.log("updateBucket error:", updateError.message);
      } else {
        console.log("Bucket updated successfully");
      }
    }
  } else {
    console.log("Bucket created:", JSON.stringify(data));
  }

  // Verify
  const { data: buckets } = await db.storage.listBuckets();
  const attachments = buckets?.find((b) => b.id === "attachments");
  console.log("\nVerification - attachments bucket:", attachments ? "EXISTS" : "MISSING");
  if (attachments) {
    console.log("  public:", attachments.public);
    console.log("  file_size_limit:", attachments.file_size_limit);
  }
})();