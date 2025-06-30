// app/page.tsx
import { getAllRows, addRow } from "./actions";

export default async function Home() {
  const rows = await getAllRows();

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
          placeholder="�V�����l�����"
          style={{ marginRight: "1rem", padding: "0.5rem" }}
        />
        <button type="submit">�ǉ�</button>
      </form>

      <h2 style={{ marginTop: "2rem" }}>�f�[�^�ꗗ</h2>
      <ul>
        {rows.map((row: any) => (
          <li key={row.id}>
            #{row.id}: {row.value}
          </li>
        ))}
      </ul>
    </main>
  );
}