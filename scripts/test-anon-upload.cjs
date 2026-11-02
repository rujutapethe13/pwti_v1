// Test with anon key - can we upload to 'attachments' bucket?
const { createClient } = require("@supabase/supabase-js");

const url = "https://axyguuhslxdbjhnkcnce.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4eWd1dWhzbHhkYmpobmtjbmNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5OTY4ODYsImV4cCI6MjEwMTU3Mjg4Nn0.pBQ4mfL1rHhZkWb232QbX_hQX1bK148APuvunO1WknQ";

const db = createClient(url, anonKey, { auth: { persistSession: false } });

(async () => {
  // Try to upload to attachments bucket with anon key
  const testPath = "test/diagnostic-anon-" + Date.now() + ".txt";
  const { error: uploadError } = await db.storage
    .from("attachments")
    .upload(testPath, "hello", { contentType: "text/plain", upsert: false });

  if (uploadError) {
    console.log("Anon upload error:", uploadError.message);
    console.log("Anon upload error code:", uploadError.code);
  } else {
    console.log("Anon upload succeeded, cleaning up...");
    await db.storage.from("attachments").remove([testPath]);
  }

  // Try getPublicUrl
  const { data: publicUrl } = db.storage.from("attachments").getPublicUrl("test/test.txt");
  console.log("Public URL:", publicUrl?.publicUrl);
})();