'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const tournamentGroupSchema = z.object({
  group_name: z.string().min(1, '大会名は必須です').max(100, '大会名は100文字以内で入力してください'),
  organizer: z.string().max(100, '主催者名は100文字以内で入力してください').optional(),
  venue_id: z.string().optional(),
  event_start_date: z.string().optional(),
  event_end_date: z.string().optional(),
  recruitment_start_date: z.string().optional(),
  recruitment_end_date: z.string().optional(),
  visibility: z.enum(['open', 'closed']),
  event_description: z.string().max(500, '説明は500文字以内で入力してください').optional(),
});

type TournamentGroupFormData = z.infer<typeof tournamentGroupSchema>;

interface Venue {
  venue_id: number;
  venue_name: string;
}

export default function TournamentGroupCreateForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TournamentGroupFormData>({
    resolver: zodResolver(tournamentGroupSchema),
    defaultValues: {
      visibility: 'open',
    },
  });

  // 会場一覧取得
  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const response = await fetch('/api/venues');
        const data = await response.json();
        if (data.success) {
          setVenues(data.data);
        }
      } catch (error) {
        console.error('会場一覧の取得に失敗:', error);
      }
    };

    fetchVenues();
  }, []);

  const onSubmit = async (data: TournamentGroupFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/tournament-groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          venue_id: data.venue_id ? parseInt(data.venue_id) : null,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 大会詳細画面にリダイレクト
        router.push(`/admin/tournament-groups/${result.data.group_id}`);
      } else {
        setError(result.error || '大会の作成に失敗しました');
      }
    } catch (error) {
      console.error('大会作成エラー:', error);
      setError('大会作成中にエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedVisibility = watch('visibility');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 大会名 */}
          <div>
            <Label htmlFor="group_name">大会名 *</Label>
            <Input
              id="group_name"
              {...register('group_name')}
              placeholder="例: 富山県PK選手権大会2025"
            />
            {errors.group_name && (
              <p className="text-sm text-red-500 mt-1">{errors.group_name.message}</p>
            )}
          </div>

          {/* 主催者 */}
          <div>
            <Label htmlFor="organizer">主催者</Label>
            <Input
              id="organizer"
              {...register('organizer')}
              placeholder="例: 富山県サッカー協会"
            />
            {errors.organizer && (
              <p className="text-sm text-red-500 mt-1">{errors.organizer.message}</p>
            )}
          </div>

          {/* 会場 */}
          <div>
            <Label htmlFor="venue_id">会場</Label>
            <Select
              onValueChange={(value) => setValue('venue_id', value === 'none' ? '' : value)}
              defaultValue="none"
            >
              <SelectTrigger>
                <SelectValue placeholder="会場を選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">選択なし</SelectItem>
                {venues.map((venue) => (
                  <SelectItem key={venue.venue_id} value={String(venue.venue_id)}>
                    {venue.venue_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 大会説明 */}
          <div>
            <Label htmlFor="event_description">大会説明</Label>
            <Textarea
              id="event_description"
              {...register('event_description')}
              placeholder="大会の概要や特徴を入力してください"
              rows={4}
            />
            {errors.event_description && (
              <p className="text-sm text-red-500 mt-1">{errors.event_description.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>日程設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 大会期間 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="event_start_date">大会開始日</Label>
              <Input
                id="event_start_date"
                type="date"
                {...register('event_start_date')}
              />
            </div>
            <div>
              <Label htmlFor="event_end_date">大会終了日</Label>
              <Input
                id="event_end_date"
                type="date"
                {...register('event_end_date')}
              />
            </div>
          </div>

          {/* 募集期間 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="recruitment_start_date">募集開始日</Label>
              <Input
                id="recruitment_start_date"
                type="date"
                {...register('recruitment_start_date')}
              />
            </div>
            <div>
              <Label htmlFor="recruitment_end_date">募集終了日</Label>
              <Input
                id="recruitment_end_date"
                type="date"
                {...register('recruitment_end_date')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>公開設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="visibility">公開状態</Label>
            <Select
              onValueChange={(value) => setValue('visibility', value as 'open' | 'closed')}
              value={selectedVisibility}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">公開</SelectItem>
                <SelectItem value="closed">非公開</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* エラーメッセージ */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* 送信ボタン */}
      <div className="flex justify-end space-x-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '作成中...' : '🏆 大会を作成'}
        </Button>
      </div>
    </form>
  );
}
