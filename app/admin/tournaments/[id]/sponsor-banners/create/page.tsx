'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import SponsorBannerForm from '@/components/admin/SponsorBannerForm';

export default function CreateSponsorBannerPage() {
  const params = useParams();
  const tournamentId = params.id as string;

  return (
    <div className="container mx-auto py-8">
      <Button asChild variant="outline" className="mb-6">
        <Link href={`/admin/tournaments/${tournamentId}/sponsor-banners`}>
          ← バナー一覧に戻る
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">バナー新規作成</h1>
        <p className="text-muted-foreground">新しいスポンサーバナーを作成します</p>
      </div>

      <SponsorBannerForm tournamentId={tournamentId} mode="create" />
    </div>
  );
}
