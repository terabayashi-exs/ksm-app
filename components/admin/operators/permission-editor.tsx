'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { OperatorPermissions } from '@/lib/types/operator';

interface PermissionEditorProps {
  permissions: OperatorPermissions;
  onChange: (permissions: OperatorPermissions) => void;
  compact?: boolean;
}

export default function PermissionEditor({ permissions, onChange, compact = false }: PermissionEditorProps) {
  const updatePermission = (key: keyof OperatorPermissions, value: boolean) => {
    onChange({
      ...permissions,
      [key]: value,
    });
  };

  const PermCheckbox = ({ id, label }: { id: keyof OperatorPermissions; label: string }) => (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={id}
        checked={permissions[id]}
        onCheckedChange={(checked) => updatePermission(id, checked as boolean)}
      />
      <Label htmlFor={id} className="cursor-pointer text-base">{label}</Label>
    </div>
  );

  const content = (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-orange-600 mb-2">基本情報</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PermCheckbox id="canChangeFormat" label="フォーマット変更" />
          <PermCheckbox id="canEditTournament" label="部門編集" />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-blue-600 mb-2">事前準備</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PermCheckbox id="canManageCourts" label="日程・会場・コート設定" />
          <PermCheckbox id="canManageRules" label="ルール設定" />
          <PermCheckbox id="canRegisterTeams" label="チーム登録" />
          <PermCheckbox id="canCreateDraws" label="組合せ作成・編集" />
          <PermCheckbox id="canManageParticipants" label="参加チーム管理" />
          <PermCheckbox id="canPrintRefereeCards" label="審判カード印刷" />
          <PermCheckbox id="canManageMatchComments" label="試合コメント管理" />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-green-600 mb-2">当日運営</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PermCheckbox id="canInputResults" label="試合結果入力（結果の登録）" />
          <PermCheckbox id="canConfirmResults" label="試合結果入力（結果の確定）" />
          <PermCheckbox id="canSetManualRankings" label="手動順位設定" />
          <PermCheckbox id="canChangePromotionRules" label="選出条件変更" />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-purple-600 mb-2">管理・その他</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PermCheckbox id="canManageFiles" label="お知らせ等管理" />
          <PermCheckbox id="canManageSponsors" label="スポンサー管理" />
          <PermCheckbox id="canSendEmails" label="メール送信" />
          <PermCheckbox id="canManageDisplaySettings" label="表示設定" />
          <PermCheckbox id="canManageOperators" label="運営者管理" />
        </div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="border rounded-lg p-4 bg-gray-50/30">
        <p className="text-sm font-medium mb-3">操作権限</p>
        {content}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>操作権限</CardTitle>
        <CardDescription>
          この運営者に許可する操作を選択してください（部門編集・アーカイブ・削除は管理者のみ）
        </CardDescription>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}
