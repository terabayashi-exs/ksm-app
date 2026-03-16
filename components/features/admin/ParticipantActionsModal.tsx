// components/features/admin/ParticipantActionsModal.tsx
// 参加チームアクション実行モーダル

'use client';

import React, { useState } from 'react';
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
import { AlertTriangle, CheckCircle, XCircle, Clock, Ban } from 'lucide-react';

export interface ParticipantTeam {
  tournament_team_id: number;
  tournament_id: number;
  team_id: string;
  tournament_team_name: string;
  tournament_team_omission: string;
  participation_status: 'confirmed' | 'waitlisted' | 'cancelled';
  withdrawal_status: 'active' | 'withdrawal_requested' | 'withdrawal_approved' | 'withdrawal_rejected';
  withdrawal_reason: string | null;
  withdrawal_requested_at: string | null;
  withdrawal_processed_at?: string | null;
  withdrawal_admin_comment?: string | null;
  withdrawal_impact?: 'low' | 'medium' | 'high';
  scheduled_matches?: number;
  completed_matches?: number;
  contact_phone?: string | null;
  waitlist_position?: number;
  assigned_block?: string | null;
  block_position?: number | null;
  player_count?: number;
  team_members?: Array<{
    name: string;
    email: string;
    role: string;
  }>;
}

export type ActionType = 'confirm' | 'waitlist' | 'cancel' | 'approve_withdrawal' | 'reject_withdrawal';

interface ParticipantActionsModalProps {
  open: boolean;
  onClose: () => void;
  team: ParticipantTeam | null;
  action: ActionType | null;
  onSubmit: (tournamentTeamId: number, action: ActionType, adminComment: string) => Promise<void>;
}

export default function ParticipantActionsModal({
  open,
  onClose,
  team,
  action,
  onSubmit
}: ParticipantActionsModalProps) {
  const [adminComment, setAdminComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // モーダルが開いた時にデフォルトコメントを設定
  React.useEffect(() => {
    if (open && action === 'approve_withdrawal') {
      setAdminComment('辞退を承認しました。');
    } else if (!open) {
      setAdminComment('');
    }
  }, [open, action]);

  if (!team || !action) return null;

  const getActionConfig = () => {
    switch (action) {
      case 'confirm':
        return {
          title: '参加確定に変更',
          icon: <CheckCircle className="h-6 w-6 text-green-500" />,
          description: `${team.tournament_team_name} を参加確定に変更します。`,
          confirmText: '確定に変更',
          confirmVariant: 'default' as const,
          showComment: true,
          commentLabel: '運営からのメッセージ（任意）',
          commentPlaceholder: '例: 繰り上げ確定となりました。ご参加をお待ちしております。'
        };

      case 'waitlist':
        return {
          title: 'キャンセル待ちに変更',
          icon: <Clock className="h-6 w-6 text-amber-500" />,
          description: `${team.tournament_team_name} をキャンセル待ちに変更します。`,
          confirmText: 'キャンセル待ちに変更',
          confirmVariant: 'outline' as const,
          showComment: true,
          commentLabel: '運営からのメッセージ（任意）',
          commentPlaceholder: '例: 参加枠の調整により、一時的にキャンセル待ちとさせていただきます。'
        };

      case 'cancel':
        return {
          title: '参加キャンセル',
          icon: <Ban className="h-6 w-6 text-gray-500" />,
          description: `${team.tournament_team_name} の参加をキャンセルします。この操作は慎重に行ってください。`,
          confirmText: 'キャンセルする',
          confirmVariant: 'destructive' as const,
          showComment: true,
          commentLabel: '運営からのメッセージ（任意）',
          commentPlaceholder: '例: 大変申し訳ございませんが、運営上の都合によりキャンセルとさせていただきます。'
        };

      case 'approve_withdrawal':
        return {
          title: '辞退申請を承認',
          icon: <CheckCircle className="h-6 w-6 text-green-500" />,
          description: `${team.tournament_team_name} の辞退申請を承認します。`,
          confirmText: '辞退を承認',
          confirmVariant: 'outline' as const,
          showComment: true,
          commentLabel: '運営からのコメント（任意）',
          commentPlaceholder: '例: 辞退申請を承認いたしました。またのご参加をお待ちしております。'
        };

      case 'reject_withdrawal':
        return {
          title: '辞退申請を却下',
          icon: <XCircle className="h-6 w-6 text-red-500" />,
          description: `${team.tournament_team_name} の辞退申請を却下します。`,
          confirmText: '辞退を却下',
          confirmVariant: 'outline' as const,
          showComment: true,
          commentLabel: '却下理由（必須）',
          commentPlaceholder: '例: 大会開始が近いため、辞退を受け付けることができません。'
        };

      default:
        return {
          title: '操作確認',
          icon: <AlertTriangle className="h-6 w-6 text-amber-500" />,
          description: '不明な操作です。',
          confirmText: '実行',
          confirmVariant: 'default' as const,
          showComment: false,
          commentLabel: '',
          commentPlaceholder: ''
        };
    }
  };

  const config = getActionConfig();

  const handleSubmit = async () => {
    if (!team || !action) return;

    // 却下時はコメント必須
    if (action === 'reject_withdrawal' && !adminComment.trim()) {
      alert('却下理由を入力してください');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(team.tournament_team_id, action, adminComment);
      setAdminComment('');
      onClose();
    } catch (error) {
      console.error('操作実行エラー:', error);
      alert('操作に失敗しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {config.icon}
            <DialogTitle>{config.title}</DialogTitle>
          </div>
          <DialogDescription className="text-base">{config.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 辞退申請の場合、辞退理由を表示 */}
          {(action === 'approve_withdrawal' || action === 'reject_withdrawal') && team.withdrawal_reason && (
            <Alert variant="default">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2 text-base">辞退理由</div>
                <p className="text-base">{team.withdrawal_reason}</p>
              </AlertDescription>
            </Alert>
          )}

          {/* チーム情報 */}
          {team.waitlist_position && (
            <div className="bg-muted p-4 rounded-lg space-y-2 text-base">
              <div><span className="font-semibold">キャンセル待ち順位:</span> {team.waitlist_position}位</div>
            </div>
          )}

          {/* コメント入力 */}
          {config.showComment && (
            <div className="space-y-6">
              <Label htmlFor="admin-comment" className="text-base">{config.commentLabel}</Label>
              <Textarea
                id="admin-comment"
                placeholder={config.commentPlaceholder}
                value={adminComment}
                onChange={(e) => setAdminComment(e.target.value)}
                rows={4}
                className="text-base"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            キャンセル
          </Button>
          <Button
            variant={config.confirmVariant}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? '処理中...' : config.confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
