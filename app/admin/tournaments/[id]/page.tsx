// app/admin/tournaments/[id]/page.tsx
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AdminTournamentDetailPage({ params }: PageProps) {
  const { id } = await params;
  // 一般ユーザー向けの大会詳細ページにリダイレクト
  redirect(`/public/tournaments/${id}`);
}