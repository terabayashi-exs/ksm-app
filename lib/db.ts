// lib/db.ts

import { createClient } from "@libsql/client";

// Turso �̐ڑ����� .env.local ����ǂݍ���ŃN���C�A���g�𐶐�
export const db = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});