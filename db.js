import { promises as fs } from "node:fs";

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

let poolPromise;

export function storageMode() {
  return process.env.DATABASE_URL ? "postgres" : "json";
}

async function getPool() {
  if (!poolPromise) {
    poolPromise = import("pg").then(({ Pool }) => new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false }
    })).catch(() => {
      throw new Error("PostgreSQL mode needs the pg package installed. Remove DATABASE_URL to use local JSON storage.");
    });
  }
  return poolPromise;
}

export async function readDatabase(jsonPath) {
  if (!process.env.DATABASE_URL) {
    const raw = await fs.readFile(jsonPath, "utf8");
    return JSON.parse(raw);
  }

  const pool = await getPool();
  const db = {};
  for (const table of tables) {
    const result = await pool.query(`SELECT * FROM ${table} ORDER BY created_at DESC`);
    db[table] = result.rows.map((row) => ({
      ...row,
      value: row.value === null || row.value === undefined ? row.value : Number(row.value),
      probability: row.probability === null || row.probability === undefined ? row.probability : Number(row.probability),
      ai_score: row.ai_score === null || row.ai_score === undefined ? row.ai_score : Number(row.ai_score)
    }));
  }
  return db;
}

export async function writeDatabase(jsonPath, db) {
  if (!process.env.DATABASE_URL) {
    await fs.writeFile(jsonPath, `${JSON.stringify(db, null, 2)}\n`);
    return;
  }

  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const table of childFirstTables) {
      await client.query(`DELETE FROM ${table}`);
    }
    for (const table of tables) {
      for (const row of db[table] || []) {
        const names = columns[table];
        const placeholders = names.map((_, index) => `$${index + 1}`);
        const values = names.map((name) => name === "content" && row[name] !== null && row[name] !== undefined ? JSON.stringify(row[name]) : row[name] ?? null);
        await client.query(
          `INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders.join(", ")})`,
          values
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
