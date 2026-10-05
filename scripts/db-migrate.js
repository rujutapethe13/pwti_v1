const { execSync } = require("child_process");

/**
 * Applies pending migrations to the linked Supabase project.
 *
 * This used to loop over the migration files and run `supabase db reset
 * --linked` once per file. `--linked` targets the remote database and `db
 * reset` drops and recreates it, so that script destroyed the linked database
 * and then re-applied every migration — once for each file it found. There is
 * no safe way to migrate a remote database by resetting it.
 *
 * `db push` applies only the migrations the remote has not seen, in order, and
 * leaves existing data alone. If the local schema is out of sync, that is a
 * `db reset` against a *local* stack, never a linked one.
 */
function main() {
  try {
    execSync("supabase db push", { stdio: "inherit", env: { ...process.env } });
  } catch (err) {
    console.error("\nMigration failed. The remote database was not reset.");
    process.exit(1);
  }
  console.log("Pending migrations applied.");
}

main();