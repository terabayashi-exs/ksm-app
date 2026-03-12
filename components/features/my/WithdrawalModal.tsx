'use client';

// components/features/my/WithdrawalModal.tsx
// マイダッシュボード用の辞退申請モーダル

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle } from 'lucide-react';

// バリデーションスキーマ
const withdrawalSchema = z.object({
  withdrawal_reason: z
    .string()
    .min(5, '辞退理由は5文字以上で入力してください')
    .max(50, '辞退理由は50文字以内で入力してください')
});

type WithdrawalFormData = z.infer<typeof withdrawalSchema>;

interface WithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tournamentTeamId: number;
  tournamentTeamName: string;
  tournamentName: string;
  teamId: string;
}

export default function WithdrawalModal({
  isOpen,
  onClose,
  onSuccess,
  tournamentTeamId,
  tournamentTeamName,
  tournamentName,
  teamId,
}: WithdrawalModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch
  } = useForm<WithdrawalFormData>({
    resolver: zodResolver(withdrawalSchema)
  });

  const withdrawalReason = watch('withdrawal_reason', '');
  const charCount = withdrawalReason?.length || 0;

  const onSubmit = async (data: WithdrawalFormData) => {
    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/my/teams/${teamId}/tournaments/${tournamentTeamId}/withdraw`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          withdrawal_reason: data.withdrawal_reason
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess(result.message || '辞退申請を受け付けました');
        reset();

        // 成功メッセージを表示後、少し待ってから閉じる
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
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

  const handleClose = () => {
    if (!submitting) {
      reset();
      setError(null);
      setSuccess(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            大会エントリー辞退申請
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 pt-2">
              <div className="text-sm">
                <span className="font-medium text-foreground">大会名:</span> {tournamentName}
              </div>
              <div className="text-sm">
                <span className="font-medium text-foreground">参加チーム名:</span> {tournamentTeamName}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="withdrawal_reason" className="text-sm font-medium">
              辞退理由 <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="withdrawal_reason"
              placeholder="辞退理由を入力してください（5文字以上50文字以内）"
              className="min-h-[80px] resize-y"
              disabled={submitting || !!success}
              {...register('withdrawal_reason')}
            />
            <div className="flex justify-between items-center">
              <div>
                {errors.withdrawal_reason && (
                  <p className="text-sm text-red-600">
                    {errors.withdrawal_reason.message}
                  </p>
                )}
              </div>
              <p className={`text-xs ${charCount < 5 ? 'text-red-500' : charCount > 50 ? 'text-red-500' : 'text-muted-foreground'}`}>
                {charCount} / 50文字
              </p>
            </div>
          </div>

          {/* 注意事項 */}
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 text-sm">
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>辞退申請は管理者の承認が必要です</li>
                <li>承認後はエントリーの取り消しができません</li>
                <li>辞退理由は管理者に共有されます</li>
                <li>確認メールがチーム担当者全員に送信されます</li>
              </ul>
            </AlertDescription>
          </Alert>

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

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting || !!success}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={submitting || !!success}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {submitting ? '申請中...' : success ? '申請完了' : '辞退申請を送信'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
