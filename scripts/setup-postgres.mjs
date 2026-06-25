import { readFileSync } from "node:fs";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required. Set it to your Render Postgres external database URL before running this script.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false }
});

const schema = readFileSync("schema.sql", "utf8");
const seed = JSON.parse(readFileSync("data/leadher-db.json", "utf8"));

const tables = [
  "users",
  "companies",
  "contacts",
  "opportunities",
  "proposals",
  "tasks",
  "interaction_notes",
  "knowledge_documents"
];

const columns = {
  users: ["id", "name", "email", "role", "created_at"],
  companies: ["id", "name", "website", "sector", "country", "description", "status", "created_at"],
  contacts: ["id", "company_id", "first_name", "last_name", "title", "email", "phone", "linkedin_url", "created_at"],
  opportunities: ["id", "company_id", "title", "stage", "value", "probability", "source", "close_date", "ai_score", "recommended_service", "next_action", "created_at"],
  proposals: ["id", "opportunity_id", "title", "status", "content", "value", "created_at"],
  tasks: ["id", "opportunity_id", "title", "due_date", "status", "created_at"],
  interaction_notes: ["id", "opportunity_id", "contact_id", "note", "created_at"],
  knowledge_documents: ["id", "title", "file_url", "document_type", "extracted_text", "embedding_id", "created_at"]
};

const childFirstTables = [
  "interaction_notes",
  "tasks",
  "proposals",
  "opportunities",
  "contacts",
  "knowledge_documents",
  "companies",
  "users"
];

const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query(schema);

  for (const table of childFirstTables) {
    await client.query(`DELETE FROM ${table}`);
  }

  for (const table of tables) {
    for (const row of seed[table] || []) {
      const names = columns[table];
      const placeholders = names.map((_, index) => `$${index + 1}`);
      const values = names.map((name) => {
        const value = row[name] ?? null;
        return name === "content" && value !== null ? JSON.stringify(value) : value;
      });
      await client.query(`INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders.join(", ")})`, values);
    }
  }

  await client.query("COMMIT");
  console.log("PostgreSQL schema created and ManageHer seed data imported.");
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
