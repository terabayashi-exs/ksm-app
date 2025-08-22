'use client';

// components/features/tournament/WithdrawalForm.tsx
// 大会エントリー辞退申請フォーム

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';

// バリデーションスキーマ
const withdrawalSchema = z.object({
  withdrawal_reason: z
    .string()
    .min(10, '辞退理由は10文字以上で入力してください')
    .max(500, '辞退理由は500文字以内で入力してください')
});

type WithdrawalFormData = z.infer<typeof withdrawalSchema>;

interface WithdrawalInfo {
  tournament_team_id: number;
  team_name: string;
  team_omission: string;
  tournament_name: string;
  tournament_status: string;
  withdrawal_status: string;
  withdrawal_reason?: string;
  withdrawal_requested_at?: string;
  withdrawal_processed_at?: string;
  withdrawal_processed_by?: string;
  can_withdraw: boolean;
}

interface WithdrawalFormProps {
  tournamentId: number;
}

export default function WithdrawalForm({ tournamentId }: WithdrawalFormProps) {
  const router = useRouter();
  const [withdrawalInfo, setWithdrawalInfo] = useState<WithdrawalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<WithdrawalFormData>({
    resolver: zodResolver(withdrawalSchema)
  });

  const fetchWithdrawalInfo = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tournaments/${tournamentId}/withdrawal`);
      
      if (!response.ok) {
        throw new Error('辞退情報の取得に失敗しました');
      }

      const data = await response.json();
      if (data.success) {
        setWithdrawalInfo(data.data);
      } else {
        setError(data.error || '辞退情報の取得に失敗しました');
      }
    } catch (err) {
      setError('辞退情報の取得中にエラーが発生しました');
      console.error('辞退情報取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  // 辞退状況の取得
  useEffect(() => {
    fetchWithdrawalInfo();
  }, [fetchWithdrawalInfo]);

  // 辞退申請の送信
  const onSubmit = async (data: WithdrawalFormData) => {
    if (!withdrawalInfo) return;

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/tournaments/${tournamentId}/withdrawal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tournament_team_id: withdrawalInfo.tournament_team_id,
          withdrawal_reason: data.withdrawal_reason
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess(result.message);
        reset();
        await fetchWithdrawalInfo(); // 最新状況を再取得
        
        // 成功時にチームページに戻る（遅延をつけてメッセージを表示）
        setTimeout(() => {
          router.push('/team');
        }, 2000);
      } else {
        setError(result.error || '辞退申請に失敗しました');
      }
    } catch (err) {
      setError('辞退申請中にエラーが発生しました');
      console.error('辞退申請エラー:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // 辞退ステータスのバッジ表示
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">参加中</Badge>;
      case 'withdrawal_requested':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          辞退申請中
        </Badge>;
      case 'withdrawal_approved':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          辞退承認済み
        </Badge>;
      case 'withdrawal_rejected':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          辞退却下
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // ローディング中
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // エラー状態
  if (error && !withdrawalInfo) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // 辞退情報が見つからない場合
  if (!withdrawalInfo) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert>
            <AlertDescription>この大会への参加情報が見つかりません。</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 参加状況表示 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">参加状況</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-600">大会名</Label>
              <div className="text-sm">{withdrawalInfo.tournament_name}</div>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-600">参加チーム名</Label>
              <div className="text-sm">{withdrawalInfo.team_name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium text-gray-600">現在のステータス:</Label>
            {getStatusBadge(withdrawalInfo.withdrawal_status)}
          </div>
        </CardContent>
      </Card>

      {/* 辞退申請中/承認済み/却下の場合の詳細表示 */}
      {withdrawalInfo.withdrawal_status !== 'active' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">辞退申請詳細</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {withdrawalInfo.withdrawal_reason && (
              <div>
                <Label className="text-sm font-medium text-gray-600">辞退理由</Label>
                <div className="text-sm bg-gray-50 p-3 rounded-md mt-1">
                  {withdrawalInfo.withdrawal_reason}
                </div>
              </div>
            )}
            {withdrawalInfo.withdrawal_requested_at && (
              <div>
                <Label className="text-sm font-medium text-gray-600">申請日時</Label>
                <div className="text-sm">
                  {new Date(withdrawalInfo.withdrawal_requested_at).toLocaleString('ja-JP')}
                </div>
              </div>
            )}
            {withdrawalInfo.withdrawal_processed_at && (
              <div>
                <Label className="text-sm font-medium text-gray-600">処理日時</Label>
                <div className="text-sm">
                  {new Date(withdrawalInfo.withdrawal_processed_at).toLocaleString('ja-JP')}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 辞退申請フォーム（申請可能な場合のみ表示） */}
      {withdrawalInfo.can_withdraw && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              大会エントリー辞退申請
            </CardTitle>
            <CardDescription>
              以下の内容をご確認の上、辞退理由を入力して申請してください。
              申請後は管理者の承認が必要です。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="withdrawal_reason" className="text-sm font-medium">
                  辞退理由 <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="withdrawal_reason"
                  placeholder="辞退理由を詳しく入力してください（10文字以上500文字以内）"
                  className="mt-1"
                  rows={4}
                  {...register('withdrawal_reason')}
                />
                {errors.withdrawal_reason && (
                  <p className="text-sm text-red-600 mt-1">
                    {errors.withdrawal_reason.message}
                  </p>
                )}
              </div>

              {/* エラー・成功メッセージ */}
              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700">{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700">{success}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={submitting}
                  className="bg-red-600 hover:bg-red-700 text-white border border-red-600"
                >
                  {submitting ? '申請中...' : '辞退申請を送信'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* 辞退不可の場合のメッセージ */}
      {!withdrawalInfo.can_withdraw && withdrawalInfo.withdrawal_status === 'active' && (
        <Card>
          <CardContent className="pt-6">
            <Alert>
              <AlertDescription>
                この大会は既に完了しているため、辞退申請はできません。
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}