// lib/db.ts
import { createClient } from "@libsql/client";

// Turso の接続情報を環境変数から読み込んでクライアントを生成
export const db = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});