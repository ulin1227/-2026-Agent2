import { drizzle, type AnyD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

let databaseBinding: AnyD1Database | undefined;

export function setDatabaseBinding(binding: AnyD1Database | undefined) {
  databaseBinding = binding;
}

export function getDb() {
  if (!databaseBinding) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(databaseBinding, { schema });
}
