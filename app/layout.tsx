// app/layout.tsx
export const metadata = {
  title: "KSM App",
  description: "My Next.js + Turso App",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}