'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Users, AlertCircle, CheckCircle } from 'lucide-react';

export default function EditTeamPage() {
  const router = useRouter();
  const params = useParams();
  const teamId = params.id as string;

  const [teamName, setTeamName] = useState('');
  const [teamOmission, setTeamOmission] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 現在のチーム情報を取得
  useEffect(() => {
    const fetchTeam = async () => {
      try {
        const res = await fetch(`/api/my/teams/${teamId}`);
        if (!res.ok) {
          setError('チーム情報の取得に失敗しました');
          return;
        }
        const result = await res.json();
        if (result.success) {
          setTeamName(result.data.team_name);
          setTeamOmission(result.data.team_omission ?? '');
        } else {
          setError(result.error || 'チーム情報の取得に失敗しました');
        }
      } catch {
        setError('チーム情報の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };
    fetchTeam();
  }, [teamId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      setError('チーム名を入力してください');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/my/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_name: teamName.trim(),
          team_omission: teamOmission.trim() || null,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setSuccess(true);
        // 1秒後にマイダッシュボードへ戻る
        setTimeout(() => router.push('/my?tab=team'), 1000);
      } else {
        setError(result.error || 'チーム情報の更新に失敗しました');
      }
    } catch {
      setError('チーム情報の更新に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/my?tab=team"><ArrowLeft className="w-4 h-4 mr-1" />マイダッシュボード</Link>
          </Button>
          <h1 className="text-2xl font-bold text-foreground mt-2 flex items-center gap-2">
            <Users className="w-6 h-6" />
            チーム情報を編集する
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">チーム情報</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="team_name">
                  チーム名 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="team_name"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  placeholder="例: 富山FCジュニア"
                  maxLength={100}
                  disabled={submitting || success}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="team_omission">
                  チーム略称
                  <span className="text-xs text-muted-foreground ml-2">（任意）</span>
                </Label>
                <Input
                  id="team_omission"
                  value={teamOmission}
                  onChange={e => setTeamOmission(e.target.value)}
                  placeholder="例: 富山FC"
                  maxLength={50}
                  disabled={submitting || success}
                />
                <p className="text-xs text-muted-foreground">
                  大会の組み合わせ表などに表示される短縮名です。
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}

              {success && (
                <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-green-800 dark:text-green-300">チーム情報を更新しました。ダッシュボードへ戻ります…</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={submitting || success || !teamName.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {submitting ? '更新中...' : '変更を保存する'}
                </Button>
                <Button asChild variant="outline" disabled={submitting || success}>
                  <Link href="/my?tab=team">キャンセル</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
