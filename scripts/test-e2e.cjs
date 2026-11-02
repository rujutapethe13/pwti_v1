// Test upload endpoint using the correct @supabase/ssr cookie format
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
const appUrl = "http://localhost:3001";

(async () => {
  const db = createClient(url, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // List users
  const { data: usersData } = await db.auth.admin.listUsers();
  const userList = usersData.users || usersData;
  console.log("Users:", userList.map(u => ({ email: u.email, id: u.id })));

  const testUser = userList.find(u => u.email === "email-rujutapethe@gmail.com") || userList[0];
  console.log("\nTesting with:", testUser.email, testUser.id);

  // Create a session using admin REST API
  const sessionRes = await fetch(`${url}/auth/v1/admin/createSession`, {
    method: "POST",
    headers: {
      "apikey": svcKey,
      "Authorization": `Bearer ${svcKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: testUser.id }),
  });

  console.log("\ncreateSession status:", sessionRes.status);
  
  if (!sessionRes.ok) {
    console.log("Response:", await sessionRes.text());
    process.exit(1);
  }

  const sessionData = await sessionRes.json();
  console.log("Session data keys:", Object.keys(sessionData));
  
  const accessToken = sessionData.access_token || sessionData.session?.access_token;
  const refreshToken = sessionData.refresh_token || sessionData.session?.refresh_token;
  const sessionUser = sessionData.user || sessionData.session?.user;

  // Build the session JSON that @supabase/ssr stores in the cookie
  const sessionJson = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    provider: "email",
    user: sessionUser,
    expires_at: sessionData.expires_at || sessionData.session?.expires_at,
    token_type: "bearer",
  });

  // @supabase/ssr encodes as: "base64-" + base64url(sessionJson)
  const base64url = (str) => Buffer.from(str).toString("base64url");
  const cookieValue = "base64-" + base64url(sessionJson);

  const projectRef = url.match(/https?:\/\/([^.]+)/)?.[1] || "unknown";
  const cookieName = `sb-${projectRef}-auth-token`;

  console.log("Cookie name:", cookieName);
  console.log("Cookie value prefix:", cookieValue.substring(0, 30) + "...");

  // Create test PNG
  const pngData = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  // Test upload
  console.log("\n--- Testing PNG Upload ---");
  const pngFormData = new FormData();
  pngFormData.append("file", new Blob([pngData], { type: "image/png" }), "test.png");

  const pngResponse = await fetch(`${appUrl}/api/attachments/upload`, {
    method: "POST",
    headers: {
      "Cookie": `${cookieName}=${cookieValue}`,
    },
    body: pngFormData,
  });

  console.log("PNG Status:", pngResponse.status);
  const pngBody = await pngResponse.text();
  console.log("PNG Body:", pngBody);

  if (pngResponse.ok) {
    const data = JSON.parse(pngBody);
    console.log("\nPNG SUCCESS! URL:", data.data?.url);
    console.log("  Uploaded by:", data.data?.uploadedBy);
  } else {
    console.log("\nPNG FAILED");
  }

  // Test PDF upload
  console.log("\n--- Testing PDF Upload ---");
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

  const pdfFormData = new FormData();
  pdfFormData.append("file", new Blob([pdfContent], { type: "application/pdf" }), "test.pdf");

  const pdfResponse = await fetch(`${appUrl}/api/attachments/upload`, {
    method: "POST",
    headers: {
      "Cookie": `${cookieName}=${cookieValue}`,
    },
    body: pdfFormData,
  });

  console.log("PDF Status:", pdfResponse.status);
  const pdfBody = await pdfResponse.text();
  console.log("PDF Body:", pdfBody);

  if (pdfResponse.ok) {
    const data = JSON.parse(pdfBody);
    console.log("\nPDF SUCCESS! URL:", data.data?.url);
  } else {
    console.log("\nPDF FAILED");
  }
})();