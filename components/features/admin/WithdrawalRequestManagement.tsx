'use client';

// components/features/admin/WithdrawalRequestManagement.tsx
// 管理者向け辞退申請管理コンポーネント

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import WithdrawalProcessModal from './WithdrawalProcessModal';
import BulkProcessModal from './BulkProcessModal';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  User, 
  Calendar, 
  MapPin, 
  Users,
  AlertTriangle,
  Phone,
  Mail,
  Trophy,
  Zap,
  BarChart3
} from 'lucide-react';

interface WithdrawalRequest {
  tournament_team_id: number;
  tournament_id: number;
  team_id: string;
  tournament_team_name: string;
  tournament_team_omission: string;
  withdrawal_status: string;
  withdrawal_reason: string | null;
  withdrawal_requested_at: string | null;
  withdrawal_processed_at: string | null;
  withdrawal_processed_by: string | null;
  withdrawal_admin_comment: string | null;
  assigned_block: string | null;
  block_position: number | null;
  tournament_name: string;
  tournament_status: string;
  format_name: string | null;
  venue_name: string | null;
  master_team_name: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string | null;
  player_count: number;
}

interface WithdrawalData {
  requests: WithdrawalRequest[];
  statistics: {
    pending: number;
    approved: number;
    rejected: number;
  };
  total: number;
}

export default function WithdrawalRequestManagement() {
  const [withdrawalData, setWithdrawalData] = useState<WithdrawalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [processingRequest, setProcessingRequest] = useState<number | null>(null);
  
  // モーダル関連のstate
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<WithdrawalRequest | null>(null);
  const [modalAction, setModalAction] = useState<'approve' | 'reject'>('approve');
  
  // 一括処理関連のstate
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject'>('approve');
  const [selectedRequests, setSelectedRequests] = useState<Set<number>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // 辞退申請一覧を取得
  const fetchWithdrawalRequests = async (status: string = 'all') => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/withdrawal-requests?status=${status}`);
      const result = await response.json();

      if (result.success) {
        setWithdrawalData(result.data);
      } else {
        setError(result.error || '辞退申請の取得に失敗しました');
      }
    } catch (err) {
      setError('辞退申請の取得中にエラーが発生しました');
      console.error('辞退申請取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  // モーダルを開く
  const openProcessModal = (request: WithdrawalRequest, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setModalAction(action);
    setModalOpen(true);
  };

  // モーダルを閉じる
  const closeProcessModal = () => {
    setModalOpen(false);
    setSelectedRequest(null);
  };

  // 辞退申請の処理（承認・却下）
  const processWithdrawalRequest = async (
    tournamentTeamId: number, 
    action: 'approve' | 'reject',
    adminComment?: string
  ) => {
    try {
      setProcessingRequest(tournamentTeamId);
      
      const response = await fetch(`/api/admin/withdrawal-requests/${tournamentTeamId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          admin_comment: adminComment || null
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 成功した場合、一覧を再取得
        await fetchWithdrawalRequests(activeTab);
        
        // 成功メッセージを表示（簡単な方法として、alert使用）
        alert(result.message);
      } else {
        setError(result.error || '辞退申請の処理に失敗しました');
        throw new Error(result.error);
      }
    } catch (err) {
      setError('辞退申請の処理中にエラーが発生しました');
      console.error('辞退申請処理エラー:', err);
      throw err;
    } finally {
      setProcessingRequest(null);
    }
  };

  // 一括処理の実行
  const processBulkWithdrawalRequests = async (
    action: 'approve' | 'reject',
    adminComment?: string,
    individualComments?: Record<number, string>
  ) => {
    try {
      setBulkProcessing(true);
      
      const selectedIds = Array.from(selectedRequests);
      const response = await fetch('/api/admin/withdrawal-requests/bulk-process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          tournament_team_ids: selectedIds,
          admin_comment: adminComment || null,
          individual_comments: individualComments || null
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 成功した場合、一覧を再取得
        await fetchWithdrawalRequests(activeTab);
        setSelectedRequests(new Set());
        
        // 成功メッセージを表示
        alert(`一括処理完了:\n${result.message}`);
      } else {
        setError(result.error || '一括処理に失敗しました');
        throw new Error(result.error);
      }
    } catch (err) {
      setError('一括処理中にエラーが発生しました');
      console.error('一括処理エラー:', err);
      throw err;
    } finally {
      setBulkProcessing(false);
    }
  };

  // 一括処理モーダルを開く
  const openBulkProcessModal = (action: 'approve' | 'reject') => {
    setBulkAction(action);
    setBulkModalOpen(true);
  };

  // 一括処理モーダルを閉じる
  const closeBulkProcessModal = () => {
    setBulkModalOpen(false);
    setSelectedRequests(new Set());
  };

  // チェックボックスの選択/選択解除
  const toggleRequestSelection = (tournamentTeamId: number) => {
    const newSelected = new Set(selectedRequests);
    if (newSelected.has(tournamentTeamId)) {
      newSelected.delete(tournamentTeamId);
    } else {
      newSelected.add(tournamentTeamId);
    }
    setSelectedRequests(newSelected);
  };

  // 全選択/全選択解除
  const toggleAllSelection = (requests: WithdrawalRequest[]) => {
    const requestIds = requests.map(r => r.tournament_team_id);
    const allSelected = requestIds.every(id => selectedRequests.has(id));
    
    if (allSelected) {
      // 全て選択されている場合は全て解除
      setSelectedRequests(new Set());
    } else {
      // 一部または未選択の場合は全て選択
      setSelectedRequests(new Set(requestIds));
    }
  };

  useEffect(() => {
    fetchWithdrawalRequests(activeTab);
  }, [activeTab]);

  // ステータスバッジの取得
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'withdrawal_requested':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            申請中
          </Badge>
        );
      case 'withdrawal_approved':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            承認済み
          </Badge>
        );
      case 'withdrawal_rejected':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            却下
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // 辞退申請カードの表示
  const WithdrawalCard = ({ request }: { request: WithdrawalRequest }) => {
    const isPending = request.withdrawal_status === 'withdrawal_requested';
    const isSelected = selectedRequests.has(request.tournament_team_id);
    
    return (
      <Card key={request.tournament_team_id} className={`mb-4 ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isPending && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleRequestSelection(request.tournament_team_id)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
              )}
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="w-5 h-5 text-blue-600" />
                {request.tournament_name}
              </CardTitle>
            </div>
            {getStatusBadge(request.withdrawal_status)}
          </div>
        <CardDescription className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {request.tournament_team_name} ({request.tournament_team_omission})
          </span>
          {request.assigned_block && (
            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
              {request.assigned_block}ブロック
            </span>
          )}
          <span className="text-gray-500">{request.player_count}人</span>
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* チーム連絡先 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-gray-500" />
              <span className="font-medium">代表者:</span>
              <span>{request.contact_person}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-gray-500" />
              <span className="font-medium">メール:</span>
              <span>{request.contact_email}</span>
            </div>
          </div>
          <div className="space-y-2">
            {request.contact_phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-gray-500" />
                <span className="font-medium">電話:</span>
                <span>{request.contact_phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-500" />
              <span className="font-medium">会場:</span>
              <span>{request.venue_name || '未設定'}</span>
            </div>
          </div>
        </div>

        {/* 辞退理由 */}
        {request.withdrawal_reason && (
          <div>
            <h4 className="font-medium text-gray-700 mb-2">辞退理由</h4>
            <div className="bg-white p-3 border rounded-lg text-sm">
              {request.withdrawal_reason}
            </div>
          </div>
        )}

        {/* 申請日時 */}
        {request.withdrawal_requested_at && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>申請日時: {new Date(request.withdrawal_requested_at).toLocaleString('ja-JP')}</span>
          </div>
        )}

        {/* 処理済み情報 */}
        {request.withdrawal_processed_at && (
          <div className="p-3 bg-gray-50 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4" />
              <span>処理日時: {new Date(request.withdrawal_processed_at).toLocaleString('ja-JP')}</span>
            </div>
            {request.withdrawal_processed_by && (
              <div className="text-sm text-gray-600">
                処理者: {request.withdrawal_processed_by}
              </div>
            )}
            {request.withdrawal_admin_comment && (
              <div>
                <h5 className="font-medium text-gray-700 text-sm mb-1">管理者コメント</h5>
                <div className="bg-white p-3 border rounded text-sm">
                  {request.withdrawal_admin_comment}
                </div>
              </div>
            )}
          </div>
        )}

        {/* アクションボタン（申請中のみ） */}
        {request.withdrawal_status === 'withdrawal_requested' && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              onClick={() => openProcessModal(request, 'approve')}
              disabled={processingRequest === request.tournament_team_id}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              承認
            </Button>
            <Button
              onClick={() => openProcessModal(request, 'reject')}
              disabled={processingRequest === request.tournament_team_id}
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="w-4 h-4 mr-2" />
              却下
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!withdrawalData) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-gray-500">
            辞退申請データが見つかりません
          </div>
        </CardContent>
      </Card>
    );
  }

  // タブ別のデータをフィルタリング
  const getFilteredRequests = (tab: string) => {
    switch (tab) {
      case 'pending':
        return withdrawalData.requests.filter(r => r.withdrawal_status === 'withdrawal_requested');
      case 'approved':
        return withdrawalData.requests.filter(r => r.withdrawal_status === 'withdrawal_approved');
      case 'rejected':
        return withdrawalData.requests.filter(r => r.withdrawal_status === 'withdrawal_rejected');
      default:
        return withdrawalData.requests;
    }
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">辞退申請管理</h1>
          <p className="text-gray-600">大会参加チームからの辞退申請を管理します</p>
        </div>
        <a 
          href="/admin/withdrawal-statistics" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
        >
          <BarChart3 className="w-4 h-4" />
          統計レポート
        </a>
      </div>
      {/* 辞退申請処理モーダル */}
      {selectedRequest && (
        <WithdrawalProcessModal
          request={selectedRequest}
          action={modalAction}
          isOpen={modalOpen}
          onClose={closeProcessModal}
          onProcess={processWithdrawalRequest}
          processing={processingRequest === selectedRequest.tournament_team_id}
        />
      )}

      {/* 一括処理モーダル */}
      {withdrawalData && (
        <BulkProcessModal
          requests={getFilteredRequests('pending').filter(r => selectedRequests.has(r.tournament_team_id))}
          action={bulkAction}
          isOpen={bulkModalOpen}
          onClose={closeBulkProcessModal}
          onProcess={processBulkWithdrawalRequests}
          processing={bulkProcessing}
        />
      )}

      {/* 統計サマリー */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{withdrawalData.statistics.pending}</div>
            <p className="text-sm text-gray-600">申請中</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{withdrawalData.statistics.approved}</div>
            <p className="text-sm text-gray-600">承認済み</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{withdrawalData.statistics.rejected}</div>
            <p className="text-sm text-gray-600">却下</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{withdrawalData.total}</div>
            <p className="text-sm text-gray-600">総申請数</p>
          </CardContent>
        </Card>
      </div>

      {/* 一括処理コントロール */}
      {activeTab === 'pending' && withdrawalData && withdrawalData.statistics.pending > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-semibold">一括処理</h3>
                  <p className="text-sm text-gray-600">
                    {selectedRequests.size > 0 ? `${selectedRequests.size}件選択中` : '複数の申請を一度に処理できます'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAllSelection(getFilteredRequests('pending'))}
                >
                  {selectedRequests.size === getFilteredRequests('pending').length && selectedRequests.size > 0 ? '全て解除' : '全て選択'}
                </Button>
                <Button
                  onClick={() => openBulkProcessModal('approve')}
                  disabled={selectedRequests.size === 0 || bulkProcessing}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="sm"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  一括承認 ({selectedRequests.size})
                </Button>
                <Button
                  onClick={() => openBulkProcessModal('reject')}
                  disabled={selectedRequests.size === 0 || bulkProcessing}
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  size="sm"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  一括却下 ({selectedRequests.size})
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* タブ形式での申請一覧 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            申請中 ({withdrawalData.statistics.pending})
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            承認済み ({withdrawalData.statistics.approved})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            却下 ({withdrawalData.statistics.rejected})
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            全て ({withdrawalData.total})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {getFilteredRequests('pending').length > 0 ? (
            getFilteredRequests('pending').map((request) => (
              <WithdrawalCard key={request.tournament_team_id} request={request} />
            ))
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">申請中の辞退申請はありません</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          {getFilteredRequests('approved').length > 0 ? (
            getFilteredRequests('approved').map((request) => (
              <WithdrawalCard key={request.tournament_team_id} request={request} />
            ))
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">承認済みの辞退申請はありません</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          {getFilteredRequests('rejected').length > 0 ? (
            getFilteredRequests('rejected').map((request) => (
              <WithdrawalCard key={request.tournament_team_id} request={request} />
            ))
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">却下した辞退申請はありません</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {withdrawalData.requests.length > 0 ? (
            withdrawalData.requests.map((request) => (
              <WithdrawalCard key={request.tournament_team_id} request={request} />
            ))
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">辞退申請はありません</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}