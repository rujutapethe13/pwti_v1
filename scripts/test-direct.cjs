// Test upload endpoint via direct HTTP with admin JWT from REST API
const fs = require("fs");
const path = require("path");

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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const appUrl = "http://localhost:3001";

(async () => {
  // 1. List users
  const usersRes = await fetch(`${url}/auth/v1/admin/users`, {
    headers: {
      "apikey": svcKey,
      "Authorization": `Bearer ${svcKey}`,
    },
  });
  
  const usersData = await usersRes.json();
  const users = usersData.users || [];
  console.log("Auth users:", users.map(u => ({ id: u.id, email: u.email })));
  
  if (users.length === 0) {
    console.log("No users found");
    process.exit(1);
  }

  const testUser = users.find(u => u.email === "email-rujutapethe@gmail.com") || users[0];
  console.log("\nTesting with user:", testUser.email, "ID:", testUser.id);

  // 2. Create a PNG file
  const pngData = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  // 3. Create an access token for the user via admin API
  // Use the admin.createSession or similar
  const sessionRes = await fetch(`${url}/auth/v1/admin/createSession`, {
    method: "POST",
    headers: {
      "apikey": anonKey,
      "Authorization": `Bearer ${svcKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: testUser.id }),
  });

  console.log("\nCreate session status:", sessionRes.status);
  const sessionText = await sessionRes.text();
  console.log("Session response:", sessionText.substring(0, 300));

  let accessToken;
  if (sessionRes.ok) {
    const sessionData = JSON.parse(sessionText);
    accessToken = sessionData.access_token || sessionData.session?.access_token;
    console.log("Got access token (first 20 chars):", accessToken?.substring(0, 20) + "...");
  } else {
    // Try alternative: sign in with password for a known user
    console.log("\nTrying password sign-in...");
    
    // We need a password - try the DEV_AUTO_LOGIN password
    const env = loadEnvFile(path.join(__dirname, "..", ".env.local"));
    const password = env.DEV_AUTO_LOGIN_PASSWORD;
    
    const signInRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        email: testUser.email, 
        password: password 
      }),
    });
    
    console.log("Sign-in status:", signInRes.status);
    const signInText = await signInRes.text();
    
    if (signInRes.ok) {
      const signInData = JSON.parse(signInText);
      accessToken = signInData.access_token;
      console.log("Got access token via password sign-in");
    } else {
      console.log("Sign-in failed:", signInText);
      process.exit(1);
    }
  }

  // 4. Call the upload endpoint
  const formData = new FormData();
  formData.append("file", new Blob([pngData], { type: "image/png" }), "test-upload.png");

  console.log("\n--- Upload Request ---");
  console.log("URL:", `${appUrl}/api/attachments/upload`);

  const uploadResponse = await fetch(`${appUrl}/api/attachments/upload`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
    body: formData,
  });

  console.log("\n--- Upload Response ---");
  console.log("Status:", uploadResponse.status);
  const responseText = await uploadResponse.text();
  console.log("Body:", responseText);

  if (uploadResponse.ok) {
    const data = JSON.parse(responseText);
    console.log("\nSUCCESS!");
    console.log("Attachment URL:", data.data?.url);
    console.log("Attachment ID:", data.data?.id);
    console.log("Uploaded by:", data.data?.uploadedBy);
  } else {
    console.log("\nFAILED with status", uploadResponse.status);
  }
})();