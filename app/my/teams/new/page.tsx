'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Users, AlertCircle } from 'lucide-react';

export default function NewTeamPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState('');
  const [teamOmission, setTeamOmission] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      setError('チーム名を入力してください');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/my/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_name: teamName.trim(),
          team_omission: teamOmission.trim() || undefined,
        }),
      });
      const result = await res.json();
      if (result.success) {
        router.push(`/my?tab=team`);
      } else {
        setError(result.error || 'チームの登録に失敗しました');
      }
    } catch {
      setError('チームの登録に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/my?tab=team"><ArrowLeft className="w-4 h-4 mr-1" />マイダッシュボード</Link>
          </Button>
          <h1 className="text-2xl font-bold text-foreground mt-2 flex items-center gap-2">
            <Users className="w-6 h-6" />
            チームを登録する
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
                  disabled={submitting}
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
                  disabled={submitting}
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

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={submitting || !teamName.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {submitting ? '登録中...' : 'チームを登録する'}
                </Button>
                <Button asChild variant="outline" disabled={submitting}>
                  <Link href="/my?tab=team">キャンセル</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-4 border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10">
          <CardContent className="pt-4">
            <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
              <p className="font-medium">チーム登録後にできること</p>
              <ul className="list-disc list-inside text-xs space-y-1 mt-2">
                <li>選手の登録・管理</li>
                <li>大会への参加申込</li>
                <li>副担当者をメールで招待（最大2名）</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
