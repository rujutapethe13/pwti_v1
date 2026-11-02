// Test the upload endpoint with a real PNG file
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

// Create a small PNG (1x1 red pixel)
const pngData = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

(async () => {
  const testPath = "test/test-" + Date.now() + ".png";
  
  const { error: uploadError } = await db.storage
    .from("attachments")
    .upload(testPath, pngData, { contentType: "image/png", upsert: false });

  if (uploadError) {
    console.log("Upload error:", uploadError.message);
    console.log("Upload error code:", uploadError.code);
    process.exit(1);
  }

  console.log("Upload succeeded! Path:", testPath);

  const { data: publicUrl } = db.storage.from("attachments").getPublicUrl(testPath);
  console.log("Public URL:", publicUrl?.publicUrl);

  // Verify file exists
  const { data: files } = await db.storage.from("attachments").list("test", {
    limit: 10,
  });
  console.log("Files in test folder:", files?.map(f => f.name));

  // Clean up
  await db.storage.from("attachments").remove([testPath]);
  console.log("Cleaned up test file");
})();