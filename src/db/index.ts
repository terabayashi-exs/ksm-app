import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as relations from "./relations";
import * as schema from "./schema";

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// Combine schema and relations
const fullSchema = { ...schema, ...relations };

export const db = drizzle(client, { schema: fullSchema });

// Export types for use throughout the application
export type DbClient = typeof db;
