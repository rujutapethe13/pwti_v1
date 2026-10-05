const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const backupDir = path.join(__dirname, "..", "backups");
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `backup-${timestamp}.sql`);

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

try {
  console.log("Backing up database to: " + backupPath);
  execSync(
    'supabase db dump --linked --schema public -f "' + backupPath + '"',
    { stdio: "inherit" }
  );
  console.log("Backup complete.");
} catch (err) {
  console.error("Backup failed:", err);
  process.exit(1);
}
