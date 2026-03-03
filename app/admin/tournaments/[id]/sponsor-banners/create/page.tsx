'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import SponsorBannerForm from '@/components/admin/SponsorBannerForm';

export default function CreateSponsorBannerPage() {
  const params = useParams();
  const tournamentId = params.id as string;

  return (
    <div>
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-_xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">バナー新規作成</h1>
            <p className="text-sm text-white/70 mt-1">新しいスポンサーバナーを作成します</p>
          </div>
        </div>
      </div>
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/tournaments/${tournamentId}/sponsor-banners`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              バナー一覧に戻る
            </Link>
          </Button>
        </div>
        <SponsorBannerForm tournamentId={tournamentId} mode="create" />
      </div>
    </div>
  );
}
