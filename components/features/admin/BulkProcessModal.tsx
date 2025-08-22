'use client';

// components/features/admin/BulkProcessModal.tsx
// 一括処理モーダル

import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
// import { Badge } from '@/components/ui/badge'; // 未使用のため削除
import { Checkbox } from '@/components/ui/checkbox';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  X,
  Users,
  Activity,
  Clock,
  Zap,
  FileText,
  Settings
} from 'lucide-react';

// バリデーションスキーマ
const bulkProcessSchema = z.object({
  admin_comment: z
    .string()
    .max(500, '管理者コメントは500文字以内で入力してください')
    .optional(),
  individual_comments_enabled: z.boolean().optional()
});

type BulkProcessFormData = z.infer<typeof bulkProcessSchema>;

interface WithdrawalRequest {
  tournament_team_id: number;
  tournament_team_name: string;
  tournament_name: string;
  withdrawal_reason: string | null;
  contact_person: string;
  assigned_block: string | null;
}

interface BulkAnalysis {
  total_teams: number;
  affected_tournaments: number;
  affected_matches: number;
  affected_blocks: number;
  blocks_list: string[];
  estimated_processing_time: string;
  warnings: string[];
}

interface BulkProcessModalProps {
  requests: WithdrawalRequest[];
  action: 'approve' | 'reject';
  isOpen: boolean;
  onClose: () => void;
  onProcess: (action: 'approve' | 'reject', adminComment?: string, individualComments?: Record<number, string>) => Promise<void>;
  processing: boolean;
}

export default function BulkProcessModal({ 
  requests, 
  action, 
  isOpen, 
  onClose, 
  onProcess,
  processing 
}: BulkProcessModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<BulkAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [individualCommentsEnabled, setIndividualCommentsEnabled] = useState(false);
  const [individualComments, setIndividualComments] = useState<Record<number, string>>({});
  const [selectedRequests, setSelectedRequests] = useState<Set<number>>(new Set());

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch
  } = useForm<BulkProcessFormData>({
    resolver: zodResolver(bulkProcessSchema)
  });

  const watchedIndividualEnabled = watch('individual_comments_enabled');

  // 個別コメント機能の切り替え
  useEffect(() => {
    if (watchedIndividualEnabled !== undefined) {
      setIndividualCommentsEnabled(watchedIndividualEnabled);
    }
  }, [watchedIndividualEnabled]);

  // 影響分析の取得
  const fetchAnalysis = useCallback(async () => {
    if (requests.length === 0) return;
    
    try {
      setLoadingAnalysis(true);
      const ids = requests.map(r => r.tournament_team_id).join(',');
      const response = await fetch(`/api/admin/withdrawal-requests/bulk-process?ids=${ids}&action=${action}`);
      const result = await response.json();
      
      if (result.success) {
        setAnalysis(result.data);
      } else {
        console.error('影響分析取得エラー:', result.error);
      }
    } catch (err) {
      console.error('影響分析取得エラー:', err);
    } finally {
      setLoadingAnalysis(false);
    }
  }, [requests, action]);

  // モーダルが開かれたときに影響分析を取得
  useEffect(() => {
    if (isOpen) {
      fetchAnalysis();
      setSelectedRequests(new Set(requests.map(r => r.tournament_team_id)));
    }
  }, [isOpen, requests, fetchAnalysis]);

  const onSubmit = async (data: BulkProcessFormData) => {
    try {
      setError(null);
      
      const selectedRequestsList = requests.filter(r => selectedRequests.has(r.tournament_team_id));
      if (selectedRequestsList.length === 0) {
        setError('処理対象のチームを選択してください');
        return;
      }

      const finalIndividualComments = individualCommentsEnabled ? individualComments : undefined;
      
      await onProcess(action, data.admin_comment, finalIndividualComments);
      reset();
      setIndividualComments({});
      onClose();
    } catch (err) {
      setError('処理中にエラーが発生しました');
      console.error('一括処理エラー:', err);
    }
  };

  const handleClose = () => {
    reset();
    setError(null);
    setAnalysis(null);
    setIndividualComments({});
    setSelectedRequests(new Set());
    setIndividualCommentsEnabled(false);
    onClose();
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRequests(new Set(requests.map(r => r.tournament_team_id)));
    } else {
      setSelectedRequests(new Set());
    }
  };

  const handleIndividualSelect = (tournamentTeamId: number, checked: boolean) => {
    const newSelected = new Set(selectedRequests);
    if (checked) {
      newSelected.add(tournamentTeamId);
    } else {
      newSelected.delete(tournamentTeamId);
    }
    setSelectedRequests(newSelected);
  };

  if (!isOpen) return null;

  const selectedCount = selectedRequests.size;
  const actionConfig = {
    approve: {
      title: '辞退申請の一括承認',
      description: `${requests.length}件の辞退申請を一括承認します`,
      buttonText: '一括承認する',
      buttonIcon: <CheckCircle className="w-4 h-4" />,
      buttonClass: 'bg-green-600 hover:bg-green-700 text-white',
      badgeClass: 'bg-green-50 text-green-700 border-green-200'
    },
    reject: {
      title: '辞退申請の一括却下',
      description: `${requests.length}件の辞退申請を一括却下します`,
      buttonText: '一括却下する',
      buttonIcon: <XCircle className="w-4 h-4" />,
      buttonClass: 'bg-red-600 hover:bg-red-700 text-white',
      badgeClass: 'bg-red-50 text-red-700 border-red-200'
    }
  };

  const config = actionConfig[action];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <Card className="border-0">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-600" />
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
            {/* 影響分析 */}
            {loadingAnalysis ? (
              <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
                影響分析を計算中...
              </div>
            ) : analysis ? (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  一括処理の影響範囲
                </h3>
                
                {/* 影響サマリー */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-blue-50 rounded-lg text-center">
                    <div className="text-xl font-bold text-blue-600">{analysis.total_teams}</div>
                    <div className="text-xs text-blue-700">対象チーム</div>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg text-center">
                    <div className="text-xl font-bold text-purple-600">{analysis.affected_matches}</div>
                    <div className="text-xs text-purple-700">関連試合</div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg text-center">
                    <div className="text-xl font-bold text-green-600">{analysis.affected_blocks}</div>
                    <div className="text-xs text-green-700">影響ブロック</div>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg text-center">
                    <div className="text-xl font-bold text-amber-600">
                      <Clock className="w-4 h-4 inline mr-1" />
                      {analysis.estimated_processing_time}
                    </div>
                    <div className="text-xs text-amber-700">処理時間</div>
                  </div>
                </div>

                {/* 警告メッセージ */}
                {analysis.warnings.length > 0 && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-700">
                      <ul className="list-disc list-inside space-y-1">
                        {analysis.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : null}

            {/* チーム選択 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  処理対象チーム ({selectedCount}/{requests.length}件選択)
                </h3>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedCount === requests.length}
                    onCheckedChange={handleSelectAll}
                  />
                  <Label htmlFor="select-all" className="text-sm">全て選択</Label>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto border rounded-lg">
                {requests.map((request) => (
                  <div key={request.tournament_team_id} className="p-3 border-b last:border-b-0 flex items-center space-x-3">
                    <Checkbox
                      checked={selectedRequests.has(request.tournament_team_id)}
                      onCheckedChange={(checked) => handleIndividualSelect(request.tournament_team_id, Boolean(checked))}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{request.tournament_team_name}</div>
                      <div className="text-sm text-gray-600">
                        {request.tournament_name}
                        {request.assigned_block && (
                          <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                            {request.assigned_block}ブロック
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{request.contact_person}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* 共通管理者コメント */}
              <div>
                <Label htmlFor="admin_comment" className="text-sm font-medium">
                  共通管理者コメント {action === 'reject' && <span className="text-red-500">（却下理由の記載を推奨）</span>}
                </Label>
                <Textarea
                  id="admin_comment"
                  placeholder={
                    action === 'approve' 
                      ? '承認理由や注意事項があれば記載してください（任意）'
                      : '却下理由を詳しく記載してください（全チーム共通）'
                  }
                  className="mt-1"
                  rows={3}
                  {...register('admin_comment')}
                />
                {errors.admin_comment && (
                  <p className="text-sm text-red-600 mt-1">
                    {errors.admin_comment.message}
                  </p>
                )}
              </div>

              {/* 個別コメント機能 */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="individual_comments_enabled"
                  {...register('individual_comments_enabled')}
                />
                <Label htmlFor="individual_comments_enabled" className="text-sm">
                  個別にコメントを設定する
                </Label>
              </div>

              {/* 個別コメント入力 */}
              {individualCommentsEnabled && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-sm">個別コメント</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-3 border rounded-lg p-3 bg-gray-50">
                    {requests.filter(r => selectedRequests.has(r.tournament_team_id)).map((request) => (
                      <div key={request.tournament_team_id}>
                        <Label className="text-xs font-medium text-gray-700">
                          {request.tournament_team_name}
                        </Label>
                        <Textarea
                          placeholder="このチーム専用のコメント（任意）"
                          className="mt-1"
                          rows={2}
                          value={individualComments[request.tournament_team_id] || ''}
                          onChange={(e) => setIndividualComments(prev => ({
                            ...prev,
                            [request.tournament_team_id]: e.target.value
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                  disabled={processing || selectedCount === 0}
                  className={config.buttonClass}
                >
                  {processing ? (
                    <>
                      <Settings className="w-4 h-4 animate-spin mr-2" />
                      処理中... ({selectedCount}件)
                    </>
                  ) : (
                    <>
                      {config.buttonIcon}
                      {config.buttonText} ({selectedCount}件)
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* 注意事項 */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="font-medium text-amber-800 mb-1">⚠️ 一括処理の注意事項</h4>
              <ul className="text-sm text-amber-700 space-y-1">
                <li>• 処理は選択されたチームに対してのみ実行されます</li>
                <li>• 処理中はブラウザを閉じないでください</li>
                <li>• 大量処理の場合、完了まで時間がかかる場合があります</li>
                {action === 'approve' && (
                  <li>• 承認処理には試合データの自動調整も含まれます</li>
                )}
                <li>• 処理完了後、各チームに自動でメール通知が送信されます</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}