// Test both anon and service role keys against the Supabase API
const { createClient } = require("@supabase/supabase-js");

const url = "https://axyguuhslxdbjhnkcnce.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4eWd1dWhzbHhkYmpobmtjbmNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5OTY4ODYsImV4cCI6MjEwMTU3Mjg4Nn0.pBQ4mfL1rHhZkWb232QbX_hQX1bK148APuvunO1WknQ";
const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4eWd1dWhzbhkYmpobmtjbmNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTk5Njg4NiwiZXhwIjoyMTAxNTcyODg2fQ.O7cXDeWPwHE5kf4o043JUufU0ac57_I0iA2KTQc5K8A";

function decodeJWT(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    return payload;
  } catch {
    return null;
  }
}

console.log("Anon key payload:", JSON.stringify(decodeJWT(anonKey), null, 2));
console.log("Service key payload:", JSON.stringify(decodeJWT(serviceKey), null, 2));

// Test anon key - list buckets
const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
(async () => {
  const { data, error } = await anonClient.storage.listBuckets();
  console.log("\nAnon listBuckets:", error ? `ERROR: ${error.message}` : `OK: ${data?.length} buckets`);

  // Try a simple DB query with anon
  const { error: dbError } = await anonClient.from("profiles").select("id").limit(1);
  console.log("Anon profiles query:", dbError ? `ERROR: ${dbError.message}` : "OK");
})();

// Test service key
const svcClient = createClient(url, serviceKey, { auth: { persistSession: false } });
(async () => {
  const { data, error } = await svcClient.storage.listBuckets();
  console.log("\nService listBuckets:", error ? `ERROR: ${error.message} (code: ${error.code || "N/A"})` : `OK: ${data?.length} buckets`);

  // Try a simple DB query with service role
  const { error: dbError } = await svcClient.from("profiles").select("id").limit(1);
  console.log("Service profiles query:", dbError ? `ERROR: ${dbError.message} (code: ${dbError.code || "N/A"})` : "OK");
})();