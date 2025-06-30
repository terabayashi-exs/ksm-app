// app/page.tsx
import { getAllRows, addRow } from "./actions";

// 型定義を追加
type SampleRow = {
  id: number;
  value: string;
};

export default async function Home() {
  const rows = (await getAllRows()) as unknown as SampleRow[];

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Turso Sample</h1>
      <form
        action={async (formData) => {
          "use server";
          const value = formData.get("value")?.toString();
          if (value) await addRow(value);
        }}
        style={{ marginTop: "1rem" }}
      >
        <input
          type="text"
          name="value"
          placeholder="新しい値を入力"
          style={{ marginRight: "1rem", padding: "0.5rem" }}
        />
        <button type="submit">追加</button>
      </form>

      <h2 style={{ marginTop: "2rem" }}>データ一覧</h2>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            #{row.id}: {row.value}
          </li>
        ))}
      </ul>
    </main>
  );
}