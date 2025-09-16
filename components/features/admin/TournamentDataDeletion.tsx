'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Trash2, Download, CheckCircle, XCircle, Clock, Database } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  is_archived: boolean;
  archive_ui_version: string;
}

interface DeletionResult {
  step: number;
  table: string;
  description: string;
  rowsDeleted: number;
  success: boolean;
  error?: string;
  executionTime: number;
}

interface DeletionResponse {
  success: boolean;
  message: string;
  tournamentName: string;
  deletionSummary: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    totalDeletedRecords: number;
    remainingRecords: number;
    totalExecutionTime: number;
  };
  preCheckResults: Record<string, number>;
  postCheckResults: Record<string, number>;
  deletionResults: DeletionResult[];
  recommendation: string;
}

interface TournamentDataDeletionProps {
  tournament: Tournament;
  onDeletionComplete?: () => void;
}

export default function TournamentDataDeletion({ 
  tournament, 
  onDeletionComplete 
}: TournamentDataDeletionProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [deletionResult, setDeletionResult] = useState<DeletionResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleDeleteData = async () => {
    if (!tournament.is_archived) {
      alert('この大会はアーカイブされていません。先にアーカイブを実行してください。');
      return;
    }

    setIsDeleting(true);
    setShowConfirmDialog(false);
    
    try {
      const response = await fetch(`/api/admin/tournaments/${tournament.tournament_id}/delete-data`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.success) {
        setDeletionResult(data);
        if (onDeletionComplete) {
          onDeletionComplete();
        }
      } else {
        console.error('削除処理エラー:', data);
        alert(`削除処理でエラーが発生しました: ${data.error}`);
      }
    } catch (error) {
      console.error('削除API呼び出しエラー:', error);
      alert('削除処理中にネットワークエラーが発生しました。');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusBadge = () => {
    if (!tournament.is_archived) {
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">未アーカイブ</Badge>;
    }
    return <Badge variant="default" className="bg-green-100 text-green-800">アーカイブ済み</Badge>;
  };

  const formatExecutionTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      {/* メイン削除カード */}
      <Card className="border-red-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-600" />
            <CardTitle className="text-red-700">大会データ削除</CardTitle>
            {getStatusBadge()}
          </div>
          <CardDescription>
            アーカイブ済み大会の関連データをデータベースから削除します。
            この操作は取り消すことができません。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 警告メッセージ */}
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>重要:</strong> 削除前にバックアップテーブルを作成してください。
              削除後はアーカイブデータからのみ表示が可能になります。
            </AlertDescription>
          </Alert>

          {/* 削除対象情報 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold text-gray-900 mb-2">削除対象データ:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
              <div>• 参加チーム情報</div>
              <div>• 参加選手情報</div>
              <div>• 試合データ（全件）</div>
              <div>• 試合結果（確定・未確定）</div>
              <div>• 順位表データ</div>
              <div>• 試合ブロック情報</div>
              <div>• 通知データ</div>
              <div>• 試合状態履歴</div>
            </div>
          </div>

          {/* アクションボタン */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => window.open(`/scripts/create-tournament-backup.js`, '_blank')}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              バックアップ作成スクリプト
            </Button>
            
            <Button
              onClick={() => setShowConfirmDialog(true)}
              variant="destructive"
              disabled={!tournament.is_archived || isDeleting}
              className="flex items-center gap-2"
            >
              {isDeleting ? (
                <>
                  <Clock className="h-4 w-4 animate-spin" />
                  削除処理中...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  データ削除実行
                </>
              )}
            </Button>

            {deletionResult && (
              <Button
                onClick={() => window.open(`/public/tournaments/${tournament.tournament_id}/archived`, '_blank')}
                variant="outline"
                className="flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                アーカイブページ確認
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 確認ダイアログ */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                データ削除の確認
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-gray-700">
                <p className="mb-2"><strong>削除対象:</strong> {tournament.tournament_name}</p>
                <p className="mb-2"><strong>大会ID:</strong> {tournament.tournament_id}</p>
                <p className="mb-4 text-red-600 font-medium">
                  この操作により、データベースから関連データが完全に削除されます。
                  削除後の表示はアーカイブデータからのみ可能になります。
                </p>
              </div>
              
              <div className="bg-yellow-50 p-3 rounded border-l-4 border-yellow-400">
                <p className="text-sm text-yellow-800">
                  <strong>確認事項:</strong><br />
                  ✓ バックアップテーブルを作成済み<br />
                  ✓ アーカイブページが正常に表示される<br />
                  ✓ この操作の影響を理解している
                </p>
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowConfirmDialog(false)}
                  variant="outline"
                  className="flex-1"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleDeleteData}
                  variant="destructive"
                  className="flex-1"
                >
                  削除実行
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 削除結果表示 */}
      {deletionResult && (
        <Card className={`border-2 ${
          deletionResult.deletionSummary.failedSteps === 0 
            ? 'border-green-200 bg-green-50' 
            : 'border-yellow-200 bg-yellow-50'
        }`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {deletionResult.deletionSummary.failedSteps === 0 ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              )}
              削除処理完了
            </CardTitle>
            <CardDescription>
              {deletionResult.message}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 削除サマリー */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {deletionResult.deletionSummary.successfulSteps}
                </div>
                <div className="text-sm text-gray-600">成功ステップ</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {deletionResult.deletionSummary.totalDeletedRecords}
                </div>
                <div className="text-sm text-gray-600">削除レコード</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {deletionResult.deletionSummary.remainingRecords}
                </div>
                <div className="text-sm text-gray-600">残存レコード</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {formatExecutionTime(deletionResult.deletionSummary.totalExecutionTime)}
                </div>
                <div className="text-sm text-gray-600">実行時間</div>
              </div>
            </div>

            {/* 推奨事項 */}
            <Alert className="border-blue-200 bg-blue-50">
              <Database className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                {deletionResult.recommendation}
              </AlertDescription>
            </Alert>

            {/* 詳細表示ボタン */}
            <Button
              onClick={() => setShowDetails(!showDetails)}
              variant="outline"
              className="w-full"
            >
              {showDetails ? '詳細を閉じる' : '詳細を表示'}
            </Button>

            {/* 詳細結果 */}
            {showDetails && (
              <div className="space-y-4">
                <div className="border rounded-lg p-4 bg-white">
                  <h4 className="font-semibold mb-3">削除ステップ詳細:</h4>
                  <div className="space-y-2">
                    {deletionResult.deletionResults.map((result) => (
                      <div
                        key={result.step}
                        className={`flex items-center justify-between p-2 rounded ${
                          result.success ? 'bg-green-50' : 'bg-red-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {result.success ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <div>
                            <div className="font-medium">Step {result.step}: {result.table}</div>
                            <div className="text-sm text-gray-600">{result.description}</div>
                            {result.error && (
                              <div className="text-sm text-red-600">エラー: {result.error}</div>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <div>{result.rowsDeleted} 件削除</div>
                          <div className="text-gray-500">{formatExecutionTime(result.executionTime)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 削除前後比較 */}
                <div className="border rounded-lg p-4 bg-white">
                  <h4 className="font-semibold mb-3">削除前後比較:</h4>
                  <div className="space-y-2">
                    {Object.entries(deletionResult.preCheckResults).map(([table, preCount]) => {
                      const postCount = deletionResult.postCheckResults[table] || 0;
                      return (
                        <div key={table} className="flex justify-between items-center">
                          <span className="font-medium">{table}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{preCount} 件</Badge>
                            <span>→</span>
                            <Badge 
                              variant={postCount === 0 ? "default" : "destructive"}
                              className={postCount === 0 ? "bg-green-100 text-green-800" : ""}
                            >
                              {postCount} 件
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}