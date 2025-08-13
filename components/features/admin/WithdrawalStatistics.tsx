'use client';

// components/features/admin/WithdrawalStatistics.tsx
// 辞退申請統計レポートコンポーネント

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Clock, 
  AlertTriangle,
  Download,
  Calendar,
  Target,
  Activity,
  Award,
  MessageSquare,
  Timer,
  Layers,
  RefreshCw
} from 'lucide-react';

interface WithdrawalStatistics {
  overview: {
    total_requests: number;
    pending_requests: number;
    approved_requests: number;
    rejected_requests: number;
    approval_rate: number;
  };
  timeline: {
    date: string;
    requests: number;
    approvals: number;
    rejections: number;
  }[];
  tournaments: {
    tournament_id: number;
    tournament_name: string;
    total_teams: number;
    withdrawal_requests: number;
    withdrawal_rate: number;
    approved: number;
    rejected: number;
    pending: number;
  }[];
  reasons: {
    category: string;
    count: number;
    percentage: number;
  }[];
  processing_times: {
    average_days: number;
    fastest_hours: number;
    slowest_days: number;
    within_24h: number;
    within_72h: number;
    over_week: number;
  };
  blocks_impact: {
    block_name: string;
    affected_teams: number;
    affected_matches: number;
  }[];
}

export default function WithdrawalStatistics() {
  const [statistics, setStatistics] = useState<WithdrawalStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('all');
  // const [tournamentFilter, setTournamentFilter] = useState('all'); // 未使用のため削除

  // 統計データの取得
  const fetchStatistics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (period !== 'all') params.append('period', period);
      // if (tournamentFilter !== 'all') params.append('tournament_id', tournamentFilter); // 未実装のため削除
      
      const response = await fetch(`/api/admin/withdrawal-statistics?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setStatistics(result.data);
      } else {
        setError(result.error || '統計データの取得に失敗しました');
      }
    } catch (err) {
      setError('統計データの取得中にエラーが発生しました');
      console.error('統計データ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatistics();
  }, [period]);

  // CSV出力
  const exportToCSV = () => {
    if (!statistics) return;

    const csvData = [
      ['辞退申請統計レポート'],
      [''],
      ['期間', period === 'all' ? '全期間' : `過去${period === '3months' ? '3ヶ月' : period === '6months' ? '6ヶ月' : '1年'}`],
      ['生成日時', new Date().toLocaleString('ja-JP')],
      [''],
      ['■ 概要統計'],
      ['総申請数', statistics.overview.total_requests],
      ['申請中', statistics.overview.pending_requests],
      ['承認済み', statistics.overview.approved_requests],
      ['却下', statistics.overview.rejected_requests],
      ['承認率', `${statistics.overview.approval_rate}%`],
      [''],
      ['■ 辞退理由別統計'],
      ['理由', '件数', '割合'],
      ...statistics.reasons.map(reason => [reason.category, reason.count, `${reason.percentage}%`]),
      [''],
      ['■ 処理時間統計'],
      ['平均処理日数', `${statistics.processing_times.average_days}日`],
      ['最速処理', `${statistics.processing_times.fastest_hours}時間`],
      ['最遅処理', `${statistics.processing_times.slowest_days}日`],
      ['24時間以内', statistics.processing_times.within_24h],
      ['72時間以内', statistics.processing_times.within_72h],
      ['1週間超過', statistics.processing_times.over_week]
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `辞退申請統計_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-3" />
            <div className="text-gray-500">統計データを読み込み中...</div>
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

  if (!statistics) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-gray-500">
            統計データがありません
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* フィルターコントロール */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                辞退申請統計レポート
              </CardTitle>
              <CardDescription>大会辞退申請の詳細な統計情報と分析</CardDescription>
            </div>
            <Button onClick={exportToCSV} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              CSV出力
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全期間</SelectItem>
                  <SelectItem value="3months">過去3ヶ月</SelectItem>
                  <SelectItem value="6months">過去6ヶ月</SelectItem>
                  <SelectItem value="1year">過去1年</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={fetchStatistics}
              variant="outline"
              size="sm"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              更新
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 概要統計 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-blue-600">{statistics.overview.total_requests}</div>
            <p className="text-sm text-gray-600">総申請数</p>
            <Users className="w-8 h-8 mx-auto mt-2 text-blue-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-yellow-600">{statistics.overview.pending_requests}</div>
            <p className="text-sm text-gray-600">申請中</p>
            <Clock className="w-8 h-8 mx-auto mt-2 text-yellow-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-green-600">{statistics.overview.approved_requests}</div>
            <p className="text-sm text-gray-600">承認済み</p>
            <Award className="w-8 h-8 mx-auto mt-2 text-green-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-red-600">{statistics.overview.rejected_requests}</div>
            <p className="text-sm text-gray-600">却下</p>
            <AlertTriangle className="w-8 h-8 mx-auto mt-2 text-red-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-purple-600">{statistics.overview.approval_rate}%</div>
            <p className="text-sm text-gray-600">承認率</p>
            <Target className="w-8 h-8 mx-auto mt-2 text-purple-400" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 辞退理由統計 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-orange-600" />
              辞退理由別統計
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {statistics.reasons.map((reason, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full ${{
                      '怪我・体調不良': 'bg-red-400',
                      '仕事・業務都合': 'bg-blue-400',
                      '家庭・家族の事情': 'bg-green-400',
                      'コロナ・感染症': 'bg-purple-400',
                      '天候理由': 'bg-yellow-400',
                      '交通・移動問題': 'bg-pink-400',
                      'メンバー不足': 'bg-indigo-400',
                      'その他': 'bg-gray-400'
                    }[reason.category] || 'bg-gray-400'}`}></div>
                    <span className="font-medium">{reason.category}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{reason.count}件</Badge>
                    <span className="text-sm text-gray-500">{reason.percentage}%</span>
                  </div>
                </div>
              ))}
              {statistics.reasons.length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  辞退理由のデータがありません
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 処理時間統計 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-blue-600" />
              処理時間統計
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{statistics.processing_times.average_days}日</div>
                  <div className="text-sm text-blue-700">平均処理時間</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{statistics.processing_times.fastest_hours}h</div>
                  <div className="text-sm text-green-700">最速処理</div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">24時間以内</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full" 
                        style={{ width: `${Math.min((statistics.processing_times.within_24h / (statistics.overview.approved_requests + statistics.overview.rejected_requests)) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-gray-600">{statistics.processing_times.within_24h}件</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">72時間以内</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-yellow-500 h-2 rounded-full" 
                        style={{ width: `${Math.min((statistics.processing_times.within_72h / (statistics.overview.approved_requests + statistics.overview.rejected_requests)) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-gray-600">{statistics.processing_times.within_72h}件</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">1週間超過</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-red-500 h-2 rounded-full" 
                        style={{ width: `${Math.min((statistics.processing_times.over_week / (statistics.overview.approved_requests + statistics.overview.rejected_requests)) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-gray-600">{statistics.processing_times.over_week}件</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 大会別統計 */}
      {statistics.tournaments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-600" />
              大会別辞退率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">大会名</th>
                    <th className="text-center p-2">総チーム数</th>
                    <th className="text-center p-2">辞退申請</th>
                    <th className="text-center p-2">辞退率</th>
                    <th className="text-center p-2">承認</th>
                    <th className="text-center p-2">却下</th>
                    <th className="text-center p-2">申請中</th>
                  </tr>
                </thead>
                <tbody>
                  {statistics.tournaments.map((tournament) => (
                    <tr key={tournament.tournament_id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">{tournament.tournament_name}</td>
                      <td className="text-center p-2">{tournament.total_teams}</td>
                      <td className="text-center p-2">{tournament.withdrawal_requests}</td>
                      <td className="text-center p-2">
                        <Badge 
                          variant="outline" 
                          className={tournament.withdrawal_rate > 20 ? 'text-red-600 border-red-200' : tournament.withdrawal_rate > 10 ? 'text-yellow-600 border-yellow-200' : 'text-green-600 border-green-200'}
                        >
                          {tournament.withdrawal_rate}%
                        </Badge>
                      </td>
                      <td className="text-center p-2 text-green-600">{tournament.approved}</td>
                      <td className="text-center p-2 text-red-600">{tournament.rejected}</td>
                      <td className="text-center p-2 text-yellow-600">{tournament.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ブロック別影響統計 */}
      {statistics.blocks_impact.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-600" />
              ブロック別影響統計（承認済み辞退）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {statistics.blocks_impact.map((block, index) => (
                <div key={index} className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{block.block_name}</div>
                    <div className="text-sm text-purple-700 mb-2">ブロック</div>
                    <div className="space-y-1">
                      <div className="text-lg font-semibold text-gray-700">{block.affected_teams}チーム</div>
                      <div className="text-sm text-gray-600">{block.affected_matches}試合影響</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* タイムライン（簡易版） */}
      {statistics.timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              直近の申請推移（過去30日）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {statistics.timeline.map((day, index) => (
                <div key={index} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
                  <div className="text-sm font-medium">{new Date(day.date).toLocaleDateString('ja-JP')}</div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-blue-600">申請: {day.requests}</span>
                    <span className="text-green-600">承認: {day.approvals}</span>
                    <span className="text-red-600">却下: {day.rejections}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}