// app/layout.tsx
import AuthSessionProvider from "@/components/providers/session-provider";
import "./globals.css";

export const metadata = {
  title: "PK選手権大会システム",
  description: "PK選手権大会の運営管理システム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <AuthSessionProvider>
          {children}
        </AuthSessionProvider>
      </body>
    </html>
  );
}