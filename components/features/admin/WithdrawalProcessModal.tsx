'use client';

// components/features/admin/WithdrawalProcessModal.tsx
// 辞退申請処理モーダル（承認・却下時のコメント入力）

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  X,
  User,
  Mail,
  Phone,
  Trophy,
  Users,
  Activity,
  Settings,
  Info
} from 'lucide-react';

// バリデーションスキーマ
const processSchema = z.object({
  admin_comment: z
    .string()
    .max(500, '管理者コメントは500文字以内で入力してください')
    .optional()
});

type ProcessFormData = z.infer<typeof processSchema>;

interface WithdrawalRequest {
  tournament_team_id: number;
  tournament_id: number;
  tournament_team_name: string;
  tournament_team_omission: string;
  withdrawal_reason: string | null;
  withdrawal_requested_at: string | null;
  tournament_name: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string | null;
  player_count: number;
  assigned_block: string | null;
}

interface ImpactAnalysis {
  affectedMatches: number;
  blockAdjustment: boolean;
  rankingUpdate: boolean;
  manualReviewRequired: boolean;
}

interface PlannedAction {
  type: 'auto' | 'warning' | 'info';
  action: string;
  target: string;
  description: string;
}

interface WithdrawalImpactData {
  withdrawal_info: {
    tournament_team_id: number;
    team_name: string;
    tournament_name: string;
    assigned_block: string | null;
    block_position: number | null;
  };
  impact_analysis: ImpactAnalysis;
  related_matches: Array<{
    match_id: number;
    match_code: string;
    team1_display_name: string;
    team2_display_name: string;
    match_status: string;
    is_confirmed: boolean;
  }>;
  planned_actions: PlannedAction[];
}

interface WithdrawalProcessModalProps {
  request: WithdrawalRequest;
  action: 'approve' | 'reject';
  isOpen: boolean;
  onClose: () => void;
  onProcess: (tournamentTeamId: number, action: 'approve' | 'reject', adminComment?: string) => Promise<void>;
  processing: boolean;
}

export default function WithdrawalProcessModal({ 
  request, 
  action, 
  isOpen, 
  onClose, 
  onProcess,
  processing 
}: WithdrawalProcessModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [impactData, setImpactData] = useState<WithdrawalImpactData | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [showImpactDetails, setShowImpactDetails] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<ProcessFormData>({
    resolver: zodResolver(processSchema)
  });

  const onSubmit = async (data: ProcessFormData) => {
    try {
      setError(null);
      await onProcess(request.tournament_team_id, action, data.admin_comment);
      reset();
      onClose();
    } catch (err) {
      setError('処理中にエラーが発生しました');
      console.error('辞退申請処理エラー:', err);
    }
  };

  const handleClose = () => {
    reset();
    setError(null);
    setImpactData(null);
    setShowImpactDetails(false);
    onClose();
  };

  // 承認の場合のみ影響分析を取得
  const fetchImpactAnalysis = async () => {
    if (action !== 'approve') return;
    
    try {
      setLoadingImpact(true);
      const response = await fetch(`/api/admin/withdrawal-requests/${request.tournament_team_id}/impact`);
      const result = await response.json();
      
      if (result.success) {
        setImpactData(result.data);
      } else {
        console.error('影響分析取得エラー:', result.error);
      }
    } catch (err) {
      console.error('影響分析取得エラー:', err);
    } finally {
      setLoadingImpact(false);
    }
  };

  // モーダルが開かれたときに影響分析を取得
  useEffect(() => {
    if (isOpen && action === 'approve') {
      fetchImpactAnalysis();
    }
  }, [isOpen, action, request.tournament_team_id]);

  if (!isOpen) return null;

  const actionConfig = {
    approve: {
      title: '辞退申請の承認',
      description: 'この辞退申請を承認しますか？承認後は取り消すことができません。',
      buttonText: '承認する',
      buttonIcon: <CheckCircle className="w-4 h-4" />,
      buttonClass: 'bg-green-600 hover:bg-green-700 text-white',
      badgeClass: 'bg-green-50 text-green-700 border-green-200'
    },
    reject: {
      title: '辞退申請の却下',
      description: 'この辞退申請を却下しますか？却下理由をコメントに記載することをお勧めします。',
      buttonText: '却下する',
      buttonIcon: <XCircle className="w-4 h-4" />,
      buttonClass: 'bg-red-600 hover:bg-red-700 text-white',
      badgeClass: 'bg-red-50 text-red-700 border-red-200'
    }
  };

  const config = actionConfig[action];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <Card className="border-0">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                {config.title}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                disabled={processing}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <CardDescription>{config.description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* 申請詳細 */}
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-blue-600" />
                  {request.tournament_name}
                </h3>
                <Badge variant="outline" className={config.badgeClass}>
                  {action === 'approve' ? '承認対象' : '却下対象'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">チーム:</span>
                    <span>{request.tournament_team_name} ({request.tournament_team_omission})</span>
                  </div>
                  {request.assigned_block && (
                    <div className="text-sm">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {request.assigned_block}ブロック
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">代表者:</span>
                    <span>{request.contact_person}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-gray-500" />
                    <span>{request.contact_email}</span>
                  </div>
                  {request.contact_phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-gray-500" />
                      <span>{request.contact_phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 辞退理由 */}
              {request.withdrawal_reason && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">辞退理由</h4>
                  <div className="bg-white p-3 border rounded text-sm">
                    {request.withdrawal_reason}
                  </div>
                </div>
              )}

              {/* 申請日時 */}
              {request.withdrawal_requested_at && (
                <div className="text-sm text-gray-600">
                  申請日時: {new Date(request.withdrawal_requested_at).toLocaleString('ja-JP')}
                </div>
              )}
            </div>

            {/* 承認時の影響分析 */}
            {action === 'approve' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-600" />
                    承認時の自動処理内容
                  </h3>
                  {impactData && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowImpactDetails(!showImpactDetails)}
                    >
                      <Info className="w-4 h-4 mr-1" />
                      {showImpactDetails ? '詳細を隠す' : '詳細を表示'}
                    </Button>
                  )}
                </div>

                {loadingImpact ? (
                  <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
                    影響分析を計算中...
                  </div>
                ) : impactData ? (
                  <div className="space-y-3">
                    {/* 影響サマリー */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 bg-blue-50 rounded-lg text-center">
                        <div className="text-xl font-bold text-blue-600">
                          {impactData.impact_analysis.affectedMatches}
                        </div>
                        <div className="text-xs text-blue-700">関連試合</div>
                      </div>
                      {impactData.impact_analysis.blockAdjustment && (
                        <div className="p-3 bg-green-50 rounded-lg text-center">
                          <div className="text-xl font-bold text-green-600">✓</div>
                          <div className="text-xs text-green-700">ブロック調整</div>
                        </div>
                      )}
                      {impactData.impact_analysis.rankingUpdate && (
                        <div className="p-3 bg-purple-50 rounded-lg text-center">
                          <div className="text-xl font-bold text-purple-600">✓</div>
                          <div className="text-xs text-purple-700">順位更新</div>
                        </div>
                      )}
                      {impactData.impact_analysis.manualReviewRequired && (
                        <div className="p-3 bg-amber-50 rounded-lg text-center">
                          <div className="text-xl font-bold text-amber-600">⚠</div>
                          <div className="text-xs text-amber-700">要手動確認</div>
                        </div>
                      )}
                    </div>

                    {/* 詳細表示 */}
                    {showImpactDetails && (
                      <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                        <h4 className="font-medium text-gray-700">実行される処理一覧</h4>
                        {impactData.planned_actions.map((action, index) => (
                          <div key={index} className="flex items-start gap-3 p-3 bg-white rounded border">
                            <div className={`mt-0.5 p-1 rounded ${
                              action.type === 'auto' ? 'bg-green-100 text-green-600' :
                              action.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                              'bg-blue-100 text-blue-600'
                            }`}>
                              {action.type === 'auto' ? <Settings className="w-3 h-3" /> :
                               action.type === 'warning' ? <AlertTriangle className="w-3 h-3" /> :
                               <Info className="w-3 h-3" />}
                            </div>
                            <div className="flex-1 text-sm">
                              <div className="font-medium">{action.action} - {action.target}</div>
                              <div className="text-gray-600 mt-1">{action.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 rounded-lg text-amber-700">
                    ⚠️ 影響分析の取得に失敗しました。手動で影響を確認してください。
                  </div>
                )}
              </div>
            )}

            {/* 管理者コメント入力フォーム */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="admin_comment" className="text-sm font-medium">
                  管理者コメント {action === 'reject' && <span className="text-red-500">（却下理由の記載を推奨）</span>}
                </Label>
                <Textarea
                  id="admin_comment"
                  placeholder={
                    action === 'approve' 
                      ? '承認理由や注意事項があれば記載してください（任意）'
                      : '却下理由を詳しく記載してください（チームへの説明用）'
                  }
                  className="mt-1"
                  rows={4}
                  {...register('admin_comment')}
                />
                {errors.admin_comment && (
                  <p className="text-sm text-red-600 mt-1">
                    {errors.admin_comment.message}
                  </p>
                )}
              </div>

              {/* エラーメッセージ */}
              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700">{error}</AlertDescription>
                </Alert>
              )}

              {/* アクションボタン */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={processing}
                >
                  キャンセル
                </Button>
                <Button
                  type="submit"
                  disabled={processing}
                  className={config.buttonClass}
                >
                  {config.buttonIcon}
                  {processing ? '処理中...' : config.buttonText}
                </Button>
              </div>
            </form>

            {/* 注意事項 */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="font-medium text-amber-800 mb-1">⚠️ 注意事項</h4>
              <ul className="text-sm text-amber-700 space-y-1">
                {action === 'approve' ? (
                  <>
                    <li>• 承認後は申請の取り消しができません</li>
                    <li>• チームは試合参加から除外されます</li>
                    <li>• 参加費返金は別途手動で対応してください</li>
                    <li>• 組み合わせや順位表への影響を確認してください</li>
                  </>
                ) : (
                  <>
                    <li>• 却下理由は申請チームが確認できます</li>
                    <li>• 丁寧で建設的な理由を記載してください</li>
                    <li>• 却下後、チームは再申請が可能です</li>
                    <li>• 必要に応じて直接連絡することをお勧めします</li>
                  </>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}