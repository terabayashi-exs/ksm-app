'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, AlertCircle, ArrowLeft } from 'lucide-react';
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

export default function NewTeamPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState('');
  const [teamOmission, setTeamOmission] = useState('');
  const [prefectureId, setPrefectureId] = useState<string>('');
  const [prefectures, setPrefectures] = useState<Prefecture[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          prefecture_id: prefectureId ? Number(prefectureId) : undefined,
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
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-white" />
            チームを登録する
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/my?tab=team">
              <ArrowLeft className="h-4 w-4 mr-1" />
              ダッシュボードに戻る
            </Link>
          </Button>
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

              <div className="space-y-2">
                <Label htmlFor="prefecture_id">
                  主な活動地域
                  <span className="text-xs text-muted-foreground ml-2">（任意）</span>
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
                  disabled={submitting}
                >
                  <SelectTrigger id="prefecture_id" className="bg-background">
                    <SelectValue placeholder="都道府県を選択してください" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border shadow-lg z-50">
                    <SelectItem value="none" className="text-muted-foreground bg-card hover:bg-accent">
                      選択なし
                    </SelectItem>
                    {prefectures.map((pref) => (
                      <SelectItem key={pref.prefecture_id} value={String(pref.prefecture_id)} className="bg-card hover:bg-accent">
                        {pref.prefecture_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  ここで地域を選択しておくと、大会を探すときにその地域の大会が自動で検索されるようになります。
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-destructive/5 dark:bg-red-950/20 rounded-lg border border-destructive/20 dark:border-red-800">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-destructive dark:text-red-300">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={submitting || !teamName.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
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

        <Card className="mt-4 border-primary/20 dark:border-blue-800 bg-primary/5 dark:bg-blue-950/10">
          <CardContent className="pt-4">
            <div className="text-sm text-primary dark:text-blue-300 space-y-1">
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
