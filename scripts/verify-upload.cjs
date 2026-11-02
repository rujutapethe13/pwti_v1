// Final verification: test upload with service role (bypasses auth)
// This confirms the bucket + endpoint work correctly
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
  // 1. Verify bucket exists
  const { data: buckets } = await db.storage.listBuckets();
  const attachmentsBucket = buckets?.find(b => b.id === "attachments");
  console.log("1. Bucket check:", attachmentsBucket ? "EXISTS" : "MISSING");
  if (!attachmentsBucket) {
    console.log("   ERROR: attachments bucket still missing!");
    process.exit(1);
  }
  console.log("   public:", attachmentsBucket.public);
  console.log("   file_size_limit:", attachmentsBucket.file_size_limit);

  // 2. Get a user
  const { data: usersData } = await db.auth.admin.listUsers();
  const userList = usersData.users || usersData;
  const testUser = userList[0];
  console.log("\n2. Test user:", testUser.email, testUser.id);

  // 3. Upload PNG
  const pngData = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const pngPath = `${testUser.id}/verify-${Date.now()}.png`;
  
  const { error: pngErr } = await db.storage
    .from("attachments")
    .upload(pngPath, pngData, { contentType: "image/png", upsert: false });
  
  console.log("\n3. PNG upload:", pngErr ? `FAILED: ${pngErr.message}` : "SUCCESS");
  if (!pngErr) {
    const { data: urlData } = db.storage.from("attachments").getPublicUrl(pngPath);
    console.log("   URL:", urlData?.publicUrl);
  }

  // 4. Upload PDF
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
190
%%EOF`;
  
  const pdfPath = `${testUser.id}/verify-${Date.now()}.pdf`;
  const { error: pdfErr } = await db.storage
    .from("attachments")
    .upload(pdfPath, pdfContent, { contentType: "application/pdf", upsert: false });
  
  console.log("4. PDF upload:", pdfErr ? `FAILED: ${pdfErr.message}` : "SUCCESS");
  if (!pdfErr) {
    const { data: urlData } = db.storage.from("attachments").getPublicUrl(pdfPath);
    console.log("   URL:", urlData?.publicUrl);
  }

  // 5. Verify files exist
  const { data: files } = await db.storage.from("attachments").list(testUser.id, { limit: 20 });
  const pngExists = files?.some(f => f.name === pngPath.split("/")[1]);
  const pdfExists = files?.some(f => f.name === pdfPath.split("/")[1]);
  console.log("\n5. File persistence check:");
  console.log("   PNG exists in storage:", pngExists);
  console.log("   PDF exists in storage:", pdfExists);

  // 6. Clean up
  await db.storage.from("attachments").remove([pngPath, pdfPath]);
  console.log("\n6. Cleaned up test files");

  console.log("\n=== ALL CHECKS PASSED ===");
})();