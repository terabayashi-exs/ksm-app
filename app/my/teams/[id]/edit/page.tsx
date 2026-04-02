'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle, ChevronRight, Home } from 'lucide-react';
import Header from '@/components/layout/Header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Prefecture {
  prefecture_id: number;
  prefecture_name: string;
  prefecture_code: string;
  region_name: string;
  display_order: number;
}

export default function EditTeamPage() {
  const router = useRouter();
  const params = useParams();
  const teamId = params.id as string;

  const [teamName, setTeamName] = useState('');
  const [teamOmission, setTeamOmission] = useState('');
  const [prefectureId, setPrefectureId] = useState<string>('');
  const [prefectures, setPrefectures] = useState<Prefecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 都道府県マスタを取得
  useEffect(() => {
    const fetchPrefectures = async () => {
      try {
        const res = await fetch('/api/prefectures');
        const data = await res.json();
        if (data.success) {
          setPrefectures(data.prefectures);
        }
      } catch (err) {
        console.error('Failed to fetch prefectures:', err);
      }
    };
    fetchPrefectures();
  }, []);

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
          setPrefectureId(result.data.prefecture_id ? String(result.data.prefecture_id) : '');
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
          prefecture_id: prefectureId ? Number(prefectureId) : null,
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"><Home className="h-3.5 w-3.5" /><span>Home</span></Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=team" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">マイダッシュボード</Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">チーム情報を編集</span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">チーム情報を編集</h1>
          <p className="text-sm text-gray-500 mt-1">
            チーム名・略称・活動地域を変更できます
          </p>
        </div>

        <Card className="border-2">
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
                  <span className="text-xs text-gray-500 ml-2">（任意）</span>
                </Label>
                <Input
                  id="team_omission"
                  value={teamOmission}
                  onChange={e => setTeamOmission(e.target.value)}
                  placeholder="例: 富山FC"
                  maxLength={50}
                  disabled={submitting || success}
                />
                <p className="text-xs text-gray-500">
                  大会の組み合わせ表などに表示される短縮名です。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prefecture_id">
                  主な活動地域
                  <span className="text-xs text-gray-500 ml-2">（任意）</span>
                </Label>
                <Select
                  value={prefectureId}
                  onValueChange={(value) => {
                    if (value === 'none') {
                      setPrefectureId('');
                    } else {
                      setPrefectureId(value);
                    }
                  }}
                  disabled={submitting || success}
                >
                  <SelectTrigger id="prefecture_id" className="bg-white">
                    <SelectValue placeholder="都道府県を選択してください" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-200 shadow-lg z-50">
                    <SelectItem value="none" className="text-gray-500 bg-white hover:bg-gray-100">
                      選択なし
                    </SelectItem>
                    {prefectures.map((pref) => (
                      <SelectItem key={pref.prefecture_id} value={String(pref.prefecture_id)} className="bg-white hover:bg-gray-100">
                        {pref.prefecture_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  ここで地域を選択しておくと、大会を探すときにその地域の大会が自動で検索されるようになります。
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-destructive/5 rounded-lg border border-destructive/20">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {success && (
                <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-green-800">チーム情報を更新しました。ダッシュボードへ戻ります…</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={submitting || success || !teamName.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
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
