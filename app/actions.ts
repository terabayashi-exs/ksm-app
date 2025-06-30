"use server";

import { db } from "@/lib/db";

// �f�[�^���擾���� Server Action
export async function getAllRows() {
  const result = await db.execute("SELECT * FROM sample_data;");
  return result.rows;
}

// �f�[�^��ǉ����� Server Action
export async function addRow(value: string) {
  await db.execute({
    sql: "INSERT INTO sample_data (value) VALUES (?)",
    args: [value],
  });
}