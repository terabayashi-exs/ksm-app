'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface InviteInfo {
  team_id: string;
  team_name: string;
  invited_email: string;
  invited_by_name: string;
  expires_at: string;
}

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const fetchInviteInfo = useCallback(async () => {
    if (!token) {
      setError('招待トークンが見つかりません');
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/my/teams/invite/accept?token=${token}`);
      const result = await res.json();
      if (result.success) {
        setInviteInfo(result.data);
      } else {
        setError(result.error);
      }
    } catch {
      setError('招待情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInviteInfo();
  }, [fetchInviteInfo]);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch('/api/my/teams/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const result = await res.json();
      if (result.success) {
        setAccepted(true);
      } else if (res.status === 401) {
        // 未ログイン → ログインページへリダイレクト（承認後に戻れるようにURLを渡す）
        router.push(`/auth/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      } else {
        setError(result.error);
      }
    } catch {
      setError('承認処理に失敗しました');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            {accepted ? (
              <CheckCircle className="w-12 h-12 text-green-500" />
            ) : error ? (
              <XCircle className="w-12 h-12 text-red-500" />
            ) : (
              <Users className="w-12 h-12 text-primary" />
            )}
          </div>
          <CardTitle className="text-xl">
            {accepted ? '招待を承認しました' : error ? '招待エラー' : 'チーム担当者への招待'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {accepted ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-500">
                チーム「<strong>{inviteInfo?.team_name}</strong>」の担当者として登録されました。
              </p>
              <Button asChild className="w-full">
                <Link href="/my">マイダッシュボードへ</Link>
              </Button>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-destructive/5 rounded-lg border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href="/my">マイダッシュボードへ</Link>
              </Button>
            </div>
          ) : inviteInfo ? (
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-2">
                <div className="text-sm">
                  <span className="text-gray-500">チーム名：</span>
                  <span className="font-semibold">{inviteInfo.team_name}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">招待者：</span>
                  <span className="font-medium">{inviteInfo.invited_by_name}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">招待先：</span>
                  <span className="font-medium">{inviteInfo.invited_email}</span>
                </div>
                <div className="text-xs text-gray-500">
                  有効期限: {new Date(inviteInfo.expires_at).toLocaleString('ja-JP')}
                </div>
              </div>
              <p className="text-sm text-gray-500">
                上記チームの担当者として登録されます。承認するには、招待先のメールアドレスでログインしている必要があります。
              </p>
              <Button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {accepting ? '処理中...' : '招待を承認する'}
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/my">キャンセル</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}
