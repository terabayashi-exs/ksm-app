// components/features/admin/FileManagementContainer.tsx
// ファイルアップロードと管理を統合するコンテナコンポーネント

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Upload, Link as LinkIcon } from 'lucide-react';
import FileUploader from './FileUploader';
import FileManagementTable from './FileManagementTable';

interface FileManagementContainerProps {
  tournamentId: number;
  onStatsChange?: () => void;
  filterType?: 'upload' | 'external';
}

export default function FileManagementContainer({ tournamentId, onStatsChange, filterType }: FileManagementContainerProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ファイルアップロード成功時のコールバック
  const handleUploadSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
    onStatsChange?.();
  };

  // ファイル削除・公開設定変更時のコールバック
  const handleFilesChange = () => {
    onStatsChange?.();
  };

  return (
    <>
      {/* ファイルアップロード/外部URLリンク追加 */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center">
            {filterType === 'external' ? (
              <><LinkIcon className="h-5 w-5 mr-2" />外部URLリンクの追加</>
            ) : filterType === 'upload' ? (
              <><Upload className="h-5 w-5 mr-2" />ファイルの追加</>
            ) : (
              <><Upload className="h-5 w-5 mr-2" />ファイル・リンクの追加</>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FileUploader
            tournamentId={tournamentId}
            onUploadSuccess={handleUploadSuccess}
            defaultLinkType={filterType}
          />
        </CardContent>
      </Card>

      {/* ファイル一覧・管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            {filterType === 'external' ? '登録済み外部URLリンク' :
             filterType === 'upload' ? '登録済みファイル' :
             '登録済みファイル・リンク'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FileManagementTable
            tournamentId={tournamentId}
            refreshTrigger={refreshTrigger}
            onFilesChange={handleFilesChange}
            filterType={filterType}
          />
        </CardContent>
      </Card>
    </>
  );
}