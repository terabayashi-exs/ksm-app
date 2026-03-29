'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, Loader2, ClipboardList, Calendar, Settings, Wrench, Shield } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import TournamentAccessSelector from './tournament-access-selector';
import PermissionEditor from './permission-editor';
import { DEFAULT_OPERATOR_PERMISSIONS, PERMISSION_PRESETS } from '@/lib/types/operator';
import type { TournamentAccessConfig, PermissionPreset, OperatorPermissions } from '@/lib/types/operator';

interface EditOperatorFormProps {
  operatorId: number;
  operatorEmail: string;
  operatorName: string;
  initialTournamentAccess: TournamentAccessConfig[];
  groupId?: number;
}

export default function EditOperatorForm({
  operatorId,
  operatorEmail,
  operatorName,
  initialTournamentAccess,
  groupId,
}: EditOperatorFormProps) {
  const router = useRouter();

  // プリセットのアイコンマップ
  const presetIcons = {
    preparation: ClipboardList,
    event_day: Calendar,
    management: Settings,
    operator_all: Shield,
    custom: Wrench,
  };

  const [tournamentAccess, setTournamentAccess] = useState<TournamentAccessConfig[]>(initialTournamentAccess);
  const [selectedPresets, setSelectedPresets] = useState<Set<PermissionPreset>>(new Set());
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [commonPermissions, setCommonPermissions] = useState<OperatorPermissions>(DEFAULT_OPERATOR_PERMISSIONS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 初期データから権限プリセットを推測
  useEffect(() => {
    if (initialTournamentAccess.length > 0) {
      // 最初の部門の権限を取得（全部門同じ権限を持つ前提）
      const firstPermissions = initialTournamentAccess[0].permissions;

      // プリセットの組み合わせを試して、統合結果が一致するか確認
      const availablePresets: Array<Exclude<PermissionPreset, 'custom'>> = ['preparation', 'event_day', 'management', 'operator_all'];
      let foundMatch = false;

      // すべての組み合わせを試す（ビット演算で全パターン生成）
      for (let i = 1; i < (1 << availablePresets.length); i++) {
        const combination = new Set<PermissionPreset>();

        for (let j = 0; j < availablePresets.length; j++) {
          if (i & (1 << j)) {
            combination.add(availablePresets[j]);
          }
        }

        // この組み合わせの統合権限を計算
        const merged = { ...DEFAULT_OPERATOR_PERMISSIONS };
        combination.forEach(preset => {
          const presetPermissions = PERMISSION_PRESETS[preset].permissions;
          Object.keys(presetPermissions).forEach(key => {
            const permKey = key as keyof OperatorPermissions;
            if (presetPermissions[permKey]) {
              merged[permKey] = true;
            }
          });
        });

        // 既存の権限と完全一致するか確認
        const isMatch = Object.keys(merged).every(key => {
          const permKey = key as keyof OperatorPermissions;
          return merged[permKey] === firstPermissions[permKey];
        });

        if (isMatch) {
          setSelectedPresets(combination);
          setCommonPermissions(firstPermissions);
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        // どの組み合わせにも一致しない → カスタム権限
        setUseCustomPermissions(true);
        setCommonPermissions(firstPermissions);
      }
    }
  }, [initialTournamentAccess]);

  // プリセットのトグル処理
  const togglePreset = (preset: Exclude<PermissionPreset, 'custom'>) => {
    setSelectedPresets(prev => {
      const next = new Set(prev);
      if (next.has(preset)) {
        next.delete(preset);
      } else {
        next.add(preset);
      }
      return next;
    });
  };

  // 選択されたプリセットから統合権限を計算
  const calculateMergedPermissions = useCallback((): OperatorPermissions => {
    const merged = { ...DEFAULT_OPERATOR_PERMISSIONS };

    selectedPresets.forEach(preset => {
      const presetPermissions = PERMISSION_PRESETS[preset].permissions;
      Object.keys(presetPermissions).forEach(key => {
        const permKey = key as keyof OperatorPermissions;
        if (presetPermissions[permKey]) {
          merged[permKey] = true;
        }
      });
    });

    return merged;
  }, [selectedPresets]);

  // 有効な権限を取得
  const getEffectivePermissions = useCallback((): OperatorPermissions => {
    if (useCustomPermissions) {
      return commonPermissions;
    }
    return calculateMergedPermissions();
  }, [useCustomPermissions, commonPermissions, calculateMergedPermissions]);

  // 更新処理
  const handleUpdate = async () => {
    if (tournamentAccess.length === 0) {
      setError('アクセス可能な部門を最低1つ選択してください');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 有効な権限を全部門に適用
      const effectivePermissions = getEffectivePermissions();
      const accessWithPermissions = tournamentAccess.map(access => ({
        ...access,
        permissions: effectivePermissions
      }));

      const res = await fetch(`/api/admin/operators/${operatorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentAccess: accessWithPermissions,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || '運営者情報の更新に失敗しました');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(groupId ? `/admin/operators?group_id=${groupId}` : '/admin/operators');
        router.refresh();
      }, 2000);
    } catch {
      setError('運営者情報の更新に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 運営者情報（読み取り専用） */}
      <Card>
        <CardHeader>
          <CardTitle>運営者情報</CardTitle>
          <CardDescription>
            この運営者の基本情報です（変更不可）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-sm text-gray-500">メールアドレス</Label>
            <div className="text-base font-medium mt-1">{operatorEmail}</div>
          </div>
          <div>
            <Label className="text-sm text-gray-500">名前</Label>
            <div className="text-base font-medium mt-1">{operatorName}</div>
          </div>
        </CardContent>
      </Card>

      {/* 部門選択 */}
      <Card>
        <CardHeader>
          <CardTitle>アクセス可能な部門を選択</CardTitle>
          <CardDescription>
            この運営者がアクセスできる部門を選択してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TournamentAccessSelector
            value={tournamentAccess}
            onChange={setTournamentAccess}
            groupId={groupId}
          />
        </CardContent>
      </Card>

      {/* 権限設定 */}
      <Card>
        <CardHeader>
          <CardTitle>操作権限を設定</CardTitle>
          <CardDescription>
            この運営者に許可する操作を選択してください。選択した権限は、すべての部門に適用されます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* プリセット選択 */}
          <div className="space-y-3">
            <Label className="text-base font-medium">プリセットから選択（複数選択可）</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(['preparation', 'event_day', 'management', 'operator_all'] as const).map((preset) => {
                const Icon = presetIcons[preset];
                const presetData = PERMISSION_PRESETS[preset];
                const isSelected = selectedPresets.has(preset);

                return (
                  <div
                    key={preset}
                    className={`border rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50 ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-gray-200'
                    } ${useCustomPermissions ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={() => !useCustomPermissions && togglePreset(preset)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => togglePreset(preset)}
                        disabled={useCustomPermissions}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="w-5 h-5 text-primary" />
                          <span className="font-medium text-base">{presetData.label}</span>
                        </div>
                        <p className="text-sm text-gray-500">{presetData.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* カスタム設定 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="useCustom"
                checked={useCustomPermissions}
                onCheckedChange={(checked) => {
                  setUseCustomPermissions(checked as boolean);
                  if (!checked) {
                    setSelectedPresets(new Set(['event_day']));
                  }
                }}
              />
              <Label htmlFor="useCustom" className="cursor-pointer text-base font-medium flex items-center gap-2">
                <Wrench className="w-5 h-5 text-primary" />
                カスタム設定を使用
              </Label>
            </div>
            {useCustomPermissions && (
              <div className="mt-4">
                <PermissionEditor
                  permissions={commonPermissions}
                  onChange={setCommonPermissions}
                  compact
                />
              </div>
            )}
          </div>

          {/* 有効な権限の統合結果 */}
          {!useCustomPermissions && selectedPresets.size > 0 && (
            <div className="border-t pt-6">
              <p className="text-base font-medium mb-4">有効な権限（統合結果）</p>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const labels: Record<string, string> = {
                    canManageCourts: '日程・会場・コート設定',
                    canManageRules: 'ルール設定',
                    canRegisterTeams: 'チーム登録',
                    canCreateDraws: '組合せ作成・編集',
                    canChangeFormat: 'フォーマット変更',
                    canManageParticipants: '参加チーム管理',
                    canPrintRefereeCards: '審判カード印刷',
                    canInputResults: '試合結果入力',
                    canConfirmResults: '試合結果確定',
                    canSetManualRankings: '手動順位設定',
                    canChangePromotionRules: '選出条件変更',
                    canManageFiles: 'ファイル管理',
                    canManageSponsors: 'スポンサー管理',
                    canSendEmails: 'メール送信',
                    canManageDisplaySettings: '表示設定',
                    canManageNotices: 'お知らせ管理',
                    canManageOperators: '運営者管理',
                    canEditTournament: '部門編集',
                  };
                  const categoryOrder = [
                    'canManageCourts', 'canManageRules', 'canRegisterTeams', 'canCreateDraws', 'canChangeFormat', 'canManageParticipants', 'canPrintRefereeCards',
                    'canInputResults', 'canConfirmResults', 'canSetManualRankings', 'canChangePromotionRules',
                    'canManageFiles', 'canManageSponsors', 'canSendEmails', 'canManageDisplaySettings', 'canManageNotices', 'canManageOperators', 'canEditTournament',
                  ];
                  const preparationPerms = ['canManageCourts', 'canManageRules', 'canRegisterTeams', 'canCreateDraws', 'canChangeFormat', 'canManageParticipants', 'canPrintRefereeCards'];
                  const eventDayPerms = ['canInputResults', 'canConfirmResults', 'canSetManualRankings', 'canChangePromotionRules'];
                  const managementPerms = ['canManageFiles', 'canManageSponsors', 'canSendEmails', 'canManageDisplaySettings', 'canManageNotices', 'canManageOperators', 'canEditTournament'];

                  return Object.entries(getEffectivePermissions())
                    .filter(([_, value]) => value === true)
                    .sort((a, b) => categoryOrder.indexOf(a[0]) - categoryOrder.indexOf(b[0]))
                    .map(([key]) => {
                      let badgeClass = 'bg-primary/10 text-primary';
                      if (preparationPerms.includes(key)) badgeClass = 'bg-blue-100 text-blue-700';
                      else if (eventDayPerms.includes(key)) badgeClass = 'bg-green-100 text-green-700';
                      else if (managementPerms.includes(key)) badgeClass = 'bg-purple-100 text-purple-700';

                      return (
                        <span
                          key={key}
                          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badgeClass}`}
                        >
                          {labels[key] || key}
                        </span>
                      );
                    });
                })()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* エラー・成功メッセージ */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>運営者情報を更新しました</strong>
            <div className="mt-1 text-sm">
              運営者一覧画面に戻ります...
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* アクション */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.push(groupId ? `/admin/operators?group_id=${groupId}` : '/admin/operators')}
          disabled={submitting}
        >
          キャンセル
        </Button>
        <Button
          onClick={handleUpdate}
          disabled={submitting || tournamentAccess.length === 0}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              更新中...
            </>
          ) : (
            '更新'
          )}
        </Button>
      </div>
    </div>
  );
}
