// components/features/admin/ParticipantCard.tsx
// 参加チームカードコンポーネント

'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Users, Mail, Phone, Calendar, Info } from 'lucide-react';
import ParticipantStatusBadge from './ParticipantStatusBadge';
import { Badge } from '@/components/ui/badge';
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

  // 影響度バッジの取得
  const getImpactBadge = () => {
    if (!team.withdrawal_impact) return null;

    const variants = {
      high: { variant: 'destructive' as const, label: '影響度: 高' },
      medium: { variant: 'default' as const, label: '影響度: 中' },
      low: { variant: 'secondary' as const, label: '影響度: 低' }
    };

    const config = variants[team.withdrawal_impact];
    return <Badge variant={config.variant}>{config.label}</Badge>;
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
                <span className="text-sm text-muted-foreground">({team.tournament_team_omission})</span>
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
        {/* 基本情報 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>選手数: {team.player_count || 0}名</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{team.contact_email}</span>
          </div>
          {team.contact_phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{team.contact_phone}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span>{team.contact_person}</span>
          </div>
        </div>

        {/* 辞退申請情報 */}
        {team.withdrawal_status === 'withdrawal_requested' && (
          <Alert variant="destructive" className="bg-red-50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-semibold">辞退申請中</div>
                {team.withdrawal_reason && (
                  <div className="text-sm">
                    <div className="font-medium mb-1">辞退理由:</div>
                    <p className="whitespace-pre-wrap">{team.withdrawal_reason}</p>
                  </div>
                )}
                {team.withdrawal_requested_at && (
                  <div className="text-xs flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    申請日時: {formatDate(team.withdrawal_requested_at)}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  {getImpactBadge()}
                  {team.scheduled_matches !== undefined && team.completed_matches !== undefined && (
                    <span className="text-xs">
                      完了試合 {team.completed_matches}/{team.scheduled_matches}
                    </span>
                  )}
                </div>
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
          <div className="text-xs text-muted-foreground pt-2 border-t">
            <div>
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
