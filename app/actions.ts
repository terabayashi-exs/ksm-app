"use server";

import { db } from "../lib/db";

// データを取得する Server Action
export async function getAllRows() {
  const result = await db.execute("SELECT * FROM sample_data;");
  return result.rows;
}

// データを追加する Server Action
export async function addRow(value: string) {
  console.log("追加する値:", value); // ← ログ出力追加
  await db.execute({
    sql: "INSERT INTO sample_data (value) VALUES (?)",
    args: [value],
  });
}