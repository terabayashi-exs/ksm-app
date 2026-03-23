// components/features/admin/ParticipantCard.tsx
// 参加チームカードコンポーネント

'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Phone, Calendar, Info } from 'lucide-react';
import ParticipantStatusBadge from './ParticipantStatusBadge';
import type { ParticipantTeam, ActionType } from './ParticipantActionsModal';

interface ParticipantCardProps {
  team: ParticipantTeam;
  onAction: (team: ParticipantTeam, action: ActionType) => void;
}

export default function ParticipantCard({ team, onAction }: ParticipantCardProps) {
  // カードのスタイルを状態に応じて変更
  const getCardClassName = () => {
    if (team.withdrawal_status === 'withdrawal_requested') {
      return 'border-2 border-red-300 bg-red-50/50';
    }
    if (team.participation_status === 'waitlisted') {
      return 'border-2 border-amber-300 bg-amber-50/50';
    }
    if (team.participation_status === 'cancelled') {
      return 'border-2 border-gray-300 bg-gray-50/50 opacity-75';
    }
    return 'border-2 border-green-200 bg-green-50/20';
  };


  // 日時フォーマット
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className={getCardClassName()}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-xl">{team.tournament_team_name}</CardTitle>
              {team.tournament_team_omission && (
                <span className="text-sm text-gray-500">({team.tournament_team_omission})</span>
              )}
            </div>
            <CardDescription>
              {team.assigned_block && (
                <span>{team.assigned_block}ブロック {team.block_position}位</span>
              )}
            </CardDescription>
          </div>
          <ParticipantStatusBadge
            participationStatus={team.participation_status}
            withdrawalStatus={team.withdrawal_status}
            waitlistPosition={team.waitlist_position}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 担当者情報 */}
        <div className="space-y-2">
          {team.team_members && team.team_members.length > 0 ? (
            team.team_members.map((member, index) => (
              <div key={index} className="flex items-start gap-2 text-base">
                <Info className="h-5 w-5 text-gray-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">担当者{index + 1}: {member.name}</span>
                  <span className="ml-3">メールアドレス: {member.email}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 text-base text-gray-500">
              <Info className="h-5 w-5" />
              <span>担当者未登録</span>
            </div>
          )}
          {team.contact_phone && (
            <div className="flex items-center gap-2 text-base">
              <Phone className="h-5 w-5 text-gray-500" />
              <span>電話番号: {team.contact_phone}</span>
            </div>
          )}
        </div>

        {/* 辞退申請情報 */}
        {team.withdrawal_status === 'withdrawal_requested' && (
          <Alert variant="destructive" className="bg-red-50">
            <AlertTriangle className="h-5 w-5" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-semibold text-base">辞退申請中</div>
                {team.withdrawal_reason && (
                  <div className="text-base">
                    <span className="font-medium">辞退理由: </span>
                    <span>{team.withdrawal_reason}</span>
                  </div>
                )}
                {team.withdrawal_requested_at && (
                  <div className="text-sm flex items-center gap-1 text-gray-500">
                    <Calendar className="h-4 w-4" />
                    申請日時: {formatDate(team.withdrawal_requested_at)}
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* アクションボタン */}
        <div className="flex flex-wrap gap-2 pt-2">
          {team.withdrawal_status === 'withdrawal_requested' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-50"
                onClick={() => onAction(team, 'approve_withdrawal')}
              >
                ✓ 辞退承認
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction(team, 'reject_withdrawal')}
              >
                ✕ 却下
              </Button>
            </>
          ) : team.participation_status === 'confirmed' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction(team, 'waitlist')}
              >
                → 待機へ
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-600 text-red-600 hover:bg-red-50"
                onClick={() => onAction(team, 'cancel')}
              >
                ✕ キャンセル
              </Button>
            </>
          ) : team.participation_status === 'waitlisted' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-50"
                onClick={() => onAction(team, 'confirm')}
              >
                ✓ 確定に変更
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-600 text-red-600 hover:bg-red-50"
                onClick={() => onAction(team, 'cancel')}
              >
                ✕ キャンセル
              </Button>
            </>
          ) : team.participation_status === 'cancelled' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-50"
                onClick={() => onAction(team, 'confirm')}
              >
                ✓ 確定に戻す
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-600 text-amber-600 hover:bg-amber-50"
                onClick={() => onAction(team, 'waitlist')}
              >
                → 待機に戻す
              </Button>
            </>
          ) : null}
        </div>

        {/* 処理済み辞退情報 */}
        {(team.withdrawal_status === 'withdrawal_approved' || team.withdrawal_status === 'withdrawal_rejected') && (
          <div className="text-base text-gray-500 pt-2 border-t space-y-1">
            <div className="font-semibold">
              {team.withdrawal_status === 'withdrawal_approved' ? '✓ 辞退承認済み' : '✕ 辞退却下済み'}
            </div>
            {team.withdrawal_processed_at && (
              <div>処理日時: {formatDate(team.withdrawal_processed_at)}</div>
            )}
            {team.withdrawal_admin_comment && (
              <div className="mt-1">
                <span className="font-medium">コメント:</span> {team.withdrawal_admin_comment}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
