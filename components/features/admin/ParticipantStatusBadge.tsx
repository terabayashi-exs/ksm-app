// components/features/admin/ParticipantStatusBadge.tsx
// 参加チームのステータスバッジコンポーネント

import React from 'react';
import { Badge } from '@/components/ui/badge';

interface ParticipantStatusBadgeProps {
  participationStatus: 'confirmed' | 'waitlisted' | 'cancelled';
  withdrawalStatus: 'active' | 'withdrawal_requested' | 'withdrawal_approved' | 'withdrawal_rejected';
  waitlistPosition?: number;
}

export default function ParticipantStatusBadge({
  participationStatus,
  withdrawalStatus,
  waitlistPosition
}: ParticipantStatusBadgeProps) {
  // 辞退申請中が最優先
  if (withdrawalStatus === 'withdrawal_requested') {
    return (
      <Badge variant="destructive" className="animate-pulse">
        🚨 辞退申請中
      </Badge>
    );
  }

  // 参加状態で表示
  switch (participationStatus) {
    case 'confirmed':
      return (
        <Badge className="bg-green-500 hover:bg-green-600 text-white">
          ✅ 参加確定
        </Badge>
      );

    case 'waitlisted':
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600 text-white">
          ⏳ キャンセル待ち {waitlistPosition ? `(${waitlistPosition}位)` : ''}
        </Badge>
      );

    case 'cancelled':
      return (
        <Badge variant="secondary">
          ❌ キャンセル済み
        </Badge>
      );

    default:
      return (
        <Badge variant="outline">
          不明な状態
        </Badge>
      );
  }
}
