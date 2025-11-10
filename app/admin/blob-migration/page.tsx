// app/admin/blob-migration/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Database, 
  HardDrive, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  FileText,
  RefreshCw,
  PlayCircle,
  Shield,
  BarChart3
} from 'lucide-react';

interface MigrationStatus {
  overview: {
    total_db_archives: number;
    total_blob_archives: number;
    migration_progress_percent: number;
    data_consistency_score: number;
  };
  categories: {
    migrated: Array<{
      tournament_id: number;
      tournament_name: string;
      archived_at: string;
      file_size_kb: number;
      data_match: boolean;
    }>;
    not_migrated: Array<{
      tournament_id: number;
      tournament_name: string;
      archived_at: string;
      estimated_size_kb: number;
    }>;
    blob_only: Array<{
      tournament_id: number;
      tournament_name: string;
      archived_at: string;
      file_size_kb: number;
      warning: string;
    }>;
  };
  storage_analysis: {
    db_storage_mb: number;
    blob_storage_mb: number;
    potential_savings_mb: number;
    average_archive_size_kb: number;
  };
  recommendations: Array<{
    type: 'action' | 'warning' | 'info';
    title: string;
    description: string;
    action_url?: string;
  }>;
}

export default function BlobMigrationPage() {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationInProgress, setMigrationInProgress] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // ステータス取得
  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/migration-status', {
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data);
        setError(null);
        setLastUpdate(new Date());
      } else {
        throw new Error(data.error || '不明なエラー');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データ取得エラー');
      console.error('Status fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // 移行実行
  const executeMigration = async (dryRun = false) => {
    try {
      setMigrationInProgress(true);
      
      const response = await fetch('/api/admin/migrate-to-blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'all',
          dry_run: dryRun
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`${dryRun ? 'ドライラン' : '移行'}完了: ${data.message}`);
        await fetchStatus(); // ステータス更新
      } else {
        throw new Error(data.error || '移行に失敗しました');
      }
    } catch (err) {
      alert(`移行エラー: ${err instanceof Error ? err.message : '不明なエラー'}`);
    } finally {
      setMigrationInProgress(false);
    }
  };

  // 検証実行
  const executeVerification = async () => {
    try {
      setMigrationInProgress(true);
      
      const response = await fetch('/api/admin/migration-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          check_type: 'all',
          deep_check: true
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`検証完了: ${data.message}`);
        await fetchStatus(); // ステータス更新
      } else {
        throw new Error(data.error || '検証に失敗しました');
      }
    } catch (err) {
      alert(`検証エラー: ${err instanceof Error ? err.message : '不明なエラー'}`);
    } finally {
      setMigrationInProgress(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // ローディング状態
  if (loading && !status) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>移行状況を読み込み中...</p>
        </div>
      </div>
    );
  }

  // エラー状態
  if (error && !status) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            データの取得に失敗しました: {error}
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-2"
              onClick={fetchStatus}
            >
              再試行
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!status) return null;

  const getStatusColor = (percent: number) => {
    if (percent >= 100) return 'text-green-600';
    if (percent >= 75) return 'text-blue-600';
    if (percent >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Blob移行管理</h1>
          <p className="text-gray-600 mt-1">
            アーカイブデータのVercel Blob移行状況
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={fetchStatus}
            disabled={loading || migrationInProgress}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            更新
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => executeMigration(true)}
            disabled={migrationInProgress}
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            ドライラン
          </Button>
          <Button 
            onClick={() => executeMigration(false)}
            disabled={migrationInProgress || status.categories.not_migrated.length === 0}
          >
            <Database className="h-4 w-4 mr-2" />
            移行実行
          </Button>
        </div>
      </div>

      {/* ステータス概要カード */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">移行進捗</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2 text-blue-600">
              {status.overview.migration_progress_percent}%
            </div>
            <Progress value={status.overview.migration_progress_percent} className="mb-2" />
            <p className="text-xs text-muted-foreground">
              {status.categories.migrated.length} / {status.overview.total_db_archives} 完了
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">データ整合性</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold mb-2 ${getStatusColor(status.overview.data_consistency_score)}`}>
              {status.overview.data_consistency_score}%
            </div>
            <p className="text-xs text-muted-foreground">
              データ検証は「データ検証実行」で確認
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ストレージ使用量</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {status.storage_analysis.db_storage_mb}MB
            </div>
            <p className="text-xs text-muted-foreground">
              Blob: {status.storage_analysis.blob_storage_mb}MB
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">未移行データ</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2 text-orange-600">
              {status.categories.not_migrated.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {status.storage_analysis.potential_savings_mb}MB 削減可能
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 推奨事項 */}
      {status.recommendations.length > 0 && (
        <div className="space-y-2">
          {status.recommendations.map((rec, index) => (
            <Alert 
              key={index} 
              variant={rec.type === 'warning' ? 'destructive' : 'default'}
            >
              {rec.type === 'action' ? (
                <PlayCircle className="h-4 w-4" />
              ) : rec.type === 'warning' ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <strong>{rec.title}</strong>: {rec.description}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* 詳細タブ */}
      <Tabs defaultValue="migrated" className="space-y-4">
        <TabsList>
          <TabsTrigger value="migrated">
            移行済み ({status.categories.migrated.length})
          </TabsTrigger>
          <TabsTrigger value="not_migrated">
            未移行 ({status.categories.not_migrated.length})
          </TabsTrigger>
          <TabsTrigger value="blob_only">
            Blobのみ ({status.categories.blob_only.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="migrated" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                移行済みアーカイブ
              </CardTitle>
              <CardDescription>
                データベースとBlobの両方に存在するアーカイブ
              </CardDescription>
            </CardHeader>
            <CardContent>
              {status.categories.migrated.length === 0 ? (
                <p className="text-center text-gray-500 py-4">移行済みアーカイブはありません</p>
              ) : (
                <div className="space-y-2">
                  {status.categories.migrated.map((item) => (
                    <div key={item.tournament_id} className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{item.tournament_name}</div>
                        <div className="text-sm text-gray-500">ID: {item.tournament_id}</div>
                        <div className="text-sm text-gray-500">{item.archived_at}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">{item.file_size_kb} KB</div>
                        <Badge variant={item.data_match ? 'default' : 'secondary'}>
                          {item.data_match ? '整合性OK' : '要確認'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="not_migrated" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2 text-orange-600" />
                未移行アーカイブ
              </CardTitle>
              <CardDescription>
                データベースにのみ存在するアーカイブ（移行が必要）
              </CardDescription>
            </CardHeader>
            <CardContent>
              {status.categories.not_migrated.length === 0 ? (
                <p className="text-center text-green-500 py-4">全てのアーカイブが移行済みです</p>
              ) : (
                <div className="space-y-2">
                  {status.categories.not_migrated.map((item) => (
                    <div key={item.tournament_id} className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{item.tournament_name}</div>
                        <div className="text-sm text-gray-500">ID: {item.tournament_id}</div>
                        <div className="text-sm text-gray-500">{item.archived_at}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">{item.estimated_size_kb} KB</div>
                        <Badge variant="outline">移行待ち</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="blob_only" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2 text-blue-600" />
                Blob限定アーカイブ
              </CardTitle>
              <CardDescription>
                Blobにのみ存在するアーカイブ（データベースに対応なし）
              </CardDescription>
            </CardHeader>
            <CardContent>
              {status.categories.blob_only.length === 0 ? (
                <p className="text-center text-gray-500 py-4">Blob限定アーカイブはありません</p>
              ) : (
                <div className="space-y-2">
                  {status.categories.blob_only.map((item) => (
                    <div key={item.tournament_id} className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{item.tournament_name}</div>
                        <div className="text-sm text-gray-500">ID: {item.tournament_id}</div>
                        <div className="text-sm text-gray-500">{item.archived_at}</div>
                        <div className="text-sm text-yellow-600">{item.warning}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">{item.file_size_kb} KB</div>
                        <Badge variant="outline">Blobのみ</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* フッター情報 */}
      <div className="text-center text-sm text-gray-500">
        最終更新: {lastUpdate.toLocaleString('ja-JP')}
        {migrationInProgress && (
          <span className="ml-2 text-blue-600">
            <RefreshCw className="h-3 w-3 animate-spin inline mr-1" />
            処理中...
          </span>
        )}
      </div>

      {/* アクションボタン */}
      <div className="flex justify-center gap-4 pt-4">
        <Button 
          variant="outline" 
          onClick={executeVerification}
          disabled={migrationInProgress}
        >
          <Shield className="h-4 w-4 mr-2" />
          データ検証実行
        </Button>
      </div>
    </div>
  );
}