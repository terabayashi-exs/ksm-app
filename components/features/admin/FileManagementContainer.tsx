// components/features/admin/FileManagementContainer.tsx
// ファイルアップロードと管理を統合するコンテナコンポーネント

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Upload } from 'lucide-react';
import FileUploader from './FileUploader';
import FileManagementTable from './FileManagementTable';

interface FileManagementContainerProps {
  tournamentId: number;
}

export default function FileManagementContainer({ tournamentId }: FileManagementContainerProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ファイルアップロード成功時のコールバック
  const handleUploadSuccess = () => {
    // refreshTriggerを変更してFileManagementTableの再読み込みを促す
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <>
      {/* ファイルアップロード/外部URLリンク追加 */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Upload className="h-5 w-5 mr-2" />
            ファイル・リンクの追加
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FileUploader
            tournamentId={tournamentId}
            onUploadSuccess={handleUploadSuccess}
          />
        </CardContent>
      </Card>

      {/* ファイル一覧・管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            登録済みファイル・リンク
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FileManagementTable 
            tournamentId={tournamentId}
            refreshTrigger={refreshTrigger}
          />
        </CardContent>
      </Card>
    </>
  );
}