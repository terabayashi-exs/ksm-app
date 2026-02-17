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

  const content = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="canManageCourts"
              checked={permissions.canManageCourts}
              onCheckedChange={(checked) =>
                updatePermission('canManageCourts', checked as boolean)
              }
            />
            <Label htmlFor="canManageCourts" className="cursor-pointer">
              コート名設定
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="canManageRules"
              checked={permissions.canManageRules}
              onCheckedChange={(checked) =>
                updatePermission('canManageRules', checked as boolean)
              }
            />
            <Label htmlFor="canManageRules" className="cursor-pointer">
              ルール設定
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="canRegisterTeams"
              checked={permissions.canRegisterTeams}
              onCheckedChange={(checked) =>
                updatePermission('canRegisterTeams', checked as boolean)
              }
            />
            <Label htmlFor="canRegisterTeams" className="cursor-pointer">
              チーム登録
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="canCreateDraws"
              checked={permissions.canCreateDraws}
              onCheckedChange={(checked) =>
                updatePermission('canCreateDraws', checked as boolean)
              }
            />
            <Label htmlFor="canCreateDraws" className="cursor-pointer">
              組合せ作成・編集
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="canChangeFormat"
              checked={permissions.canChangeFormat}
              onCheckedChange={(checked) =>
                updatePermission('canChangeFormat', checked as boolean)
              }
            />
            <Label htmlFor="canChangeFormat" className="cursor-pointer">
              フォーマット変更
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="canManageParticipants"
              checked={permissions.canManageParticipants}
              onCheckedChange={(checked) =>
                updatePermission('canManageParticipants', checked as boolean)
              }
            />
            <Label htmlFor="canManageParticipants" className="cursor-pointer">
              参加チーム管理
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="canInputResults"
              checked={permissions.canInputResults}
              onCheckedChange={(checked) =>
                updatePermission('canInputResults', checked as boolean)
              }
            />
            <Label htmlFor="canInputResults" className="cursor-pointer">
              試合結果入力（結果の登録）
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="canConfirmResults"
              checked={permissions.canConfirmResults}
              onCheckedChange={(checked) =>
                updatePermission('canConfirmResults', checked as boolean)
              }
            />
            <Label htmlFor="canConfirmResults" className="cursor-pointer">
              試合結果入力（結果の確定）
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="canSetManualRankings"
              checked={permissions.canSetManualRankings}
              onCheckedChange={(checked) =>
                updatePermission('canSetManualRankings', checked as boolean)
              }
            />
            <Label htmlFor="canSetManualRankings" className="cursor-pointer">
              手動順位設定
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="canChangePromotionRules"
              checked={permissions.canChangePromotionRules}
              onCheckedChange={(checked) =>
                updatePermission('canChangePromotionRules', checked as boolean)
              }
            />
            <Label htmlFor="canChangePromotionRules" className="cursor-pointer">
              選出条件変更
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="canManageFiles"
              checked={permissions.canManageFiles}
              onCheckedChange={(checked) =>
                updatePermission('canManageFiles', checked as boolean)
              }
            />
            <Label htmlFor="canManageFiles" className="cursor-pointer">
              ファイル管理
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="canManageSponsors"
              checked={permissions.canManageSponsors}
              onCheckedChange={(checked) =>
                updatePermission('canManageSponsors', checked as boolean)
              }
            />
            <Label htmlFor="canManageSponsors" className="cursor-pointer">
              スポンサー管理
            </Label>
          </div>
        </div>
  );

  if (compact) {
    return (
      <div className="border rounded-lg p-4 bg-muted/30">
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
