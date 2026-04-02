// components/features/admin/FileManagementTable.tsx
// ファイル管理テーブルコンポーネント

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Download,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  RefreshCw,
  Link as LinkIcon,
  Upload
} from 'lucide-react';
import { type TournamentFile } from '@/lib/types/tournament-files';

interface FileManagementTableProps {
  tournamentId: number;
  refreshTrigger?: number; // 外部から更新をトリガーするための props
  onFilesChange?: () => void; // ファイル削除・公開設定変更時のコールバック
  filterType?: 'upload' | 'external'; // タブによるフィルタリング
}

interface EditState {
  isOpen: boolean;
  file: TournamentFile | null;
  title: string;
  description: string;
  displayDate: string;
  isPublic: boolean;
}

interface DeleteState {
  isOpen: boolean;
  file: TournamentFile | null;
}

// ファイルサイズを人間が読みやすい形式に変換
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 日付をフォーマット
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function FileManagementTable({ tournamentId, refreshTrigger, onFilesChange, filterType }: FileManagementTableProps) {
  const [files, setFiles] = useState<TournamentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editState, setEditState] = useState<EditState>({
    isOpen: false,
    file: null,
    title: '',
    description: '',
    displayDate: '',
    isPublic: true
  });
  
  const [deleteState, setDeleteState] = useState<DeleteState>({
    isOpen: false,
    file: null
  });

  // ファイル一覧を取得
  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/files`);
      const result = await response.json();

      if (result.success) {
        setFiles(result.data.files);
      } else {
        console.error('ファイル一覧取得エラー:', result.error);
      }
    } catch (error) {
      console.error('ファイル一覧取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  // 初回読み込み & refreshTrigger変更時の更新
  useEffect(() => {
    fetchFiles();
  }, [tournamentId, refreshTrigger, fetchFiles]);

  // 編集ダイアログを開く
  const openEditDialog = (file: TournamentFile) => {
    setEditState({
      isOpen: true,
      file,
      title: file.file_title,
      description: file.file_description || '',
      displayDate: file.display_date || '',
      isPublic: Boolean(file.is_public) // 数値からブール値に変換
    });
  };

  // 編集ダイアログを閉じる
  const closeEditDialog = () => {
    setEditState({
      isOpen: false,
      file: null,
      title: '',
      description: '',
      displayDate: '',
      isPublic: true
    });
  };

  // 削除ダイアログを開く
  const openDeleteDialog = (file: TournamentFile) => {
    setDeleteState({
      isOpen: true,
      file
    });
  };

  // 削除ダイアログを閉じる
  const closeDeleteDialog = () => {
    setDeleteState({
      isOpen: false,
      file: null
    });
  };

  // ファイル情報を更新
  const handleUpdateFile = async () => {
    if (!editState.file) return;

    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/files`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file_id: editState.file.file_id,
          file_title: editState.title,
          file_description: editState.description,
          display_date: editState.displayDate || null,
          is_public: editState.isPublic,
          upload_order: editState.file.upload_order
        })
      });

      const result = await response.json();

      if (result.success) {
        await fetchFiles();
        closeEditDialog();
        onFilesChange?.();
      } else {
        alert('更新に失敗しました: ' + result.error);
      }
    } catch (error) {
      console.error('ファイル更新エラー:', error);
      alert('更新に失敗しました');
    }
  };

  // ファイルを削除
  const handleDeleteFile = async () => {
    if (!deleteState.file) return;

    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/files/${deleteState.file.file_id}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        await fetchFiles();
        closeDeleteDialog();
        onFilesChange?.();
      } else {
        alert('削除に失敗しました: ' + result.error);
      }
    } catch (error) {
      console.error('ファイル削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  // 公開設定をトグル
  const togglePublicStatus = async (file: TournamentFile) => {
    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/files`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file_id: file.file_id,
          file_title: file.file_title,
          file_description: file.file_description,
          is_public: !Boolean(file.is_public), // ブール値に変換してから反転
          upload_order: file.upload_order
        })
      });

      const result = await response.json();

      if (result.success) {
        await fetchFiles();
        onFilesChange?.();
      } else {
        alert('更新に失敗しました: ' + result.error);
      }
    } catch (error) {
      console.error('公開設定更新エラー:', error);
      alert('更新に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-500">読み込み中...</span>
      </div>
    );
  }

  const filteredFiles = filterType ? files.filter(f => f.link_type === filterType) : files;

  if (filteredFiles.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="h-12 w-12 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-500">
          {filterType === 'upload' ? 'アップロードファイルはまだありません' :
           filterType === 'external' ? '外部URLリンクはまだありません' :
           'まだファイル・リンクが登録されていません'}
        </p>
        <p className="text-sm text-gray-500 mt-2">
          上記のフォームを使用して{filterType === 'external' ? '外部URLリンクを追加' : 'ファイルのアップロードまたは外部URLリンクを追加'}してください
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 更新ボタン */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{filteredFiles.length}件のファイル</p>
        <Button variant="outline" size="sm" onClick={fetchFiles}>
          <RefreshCw className="h-4 w-4 mr-2" />
          更新
        </Button>
      </div>

      {/* ファイル一覧テーブル */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>タイトル</TableHead>
              <TableHead>サイズ</TableHead>
              <TableHead>公開状態</TableHead>
              <TableHead>添付日付</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFiles.map((file) => (
              <TableRow key={file.file_id}>
                <TableCell>
                  <div>
                    <div className="flex items-center gap-2">
                      <span title={file.link_type === 'external' ? '外部URLリンク' : 'アップロードファイル'}>
                        {file.link_type === 'external' ? (
                          <LinkIcon className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Upload className="h-4 w-4 text-gray-600" />
                        )}
                      </span>
                      <span className="font-medium">{file.file_title}</span>
                    </div>
                    <div className="text-sm text-gray-500 ml-6">
                      {file.link_type === 'external' ? (
                        <a href={file.external_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                          {file.external_url}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        file.original_filename
                      )}
                    </div>
                    {file.file_description && (
                      <div className="text-sm text-gray-500 mt-1 ml-6">
                        {file.file_description}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">
                    {file.link_type === 'external' ? '-' : formatFileSize(file.file_size)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={Boolean(file.is_public)}
                      onCheckedChange={() => togglePublicStatus(file)}
                    />
                    <span className="text-sm">
                      {Boolean(file.is_public) ? (
                        <span className="flex items-center text-green-600">
                          <Eye className="h-4 w-4 mr-1" />
                          公開
                        </span>
                      ) : (
                        <span className="flex items-center text-gray-500">
                          <EyeOff className="h-4 w-4 mr-1" />
                          非公開
                        </span>
                      )}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{file.display_date || formatDate(file.uploaded_at)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end space-x-2">
                    {/* ダウンロードボタン */}
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <a
                        href={file.blob_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={`${file.file_title}.pdf`}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>

                    {/* プレビューボタン */}
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <a
                        href={file.blob_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>

                    {/* 編集ボタン */}
                    <Dialog open={editState.isOpen && editState.file?.file_id === file.file_id}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(file)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>ファイル情報編集</DialogTitle>
                          <DialogDescription>
                            ファイルのタイトルや説明、公開設定を変更できます
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="edit-title">タイトル</Label>
                            <Input
                              id="edit-title"
                              value={editState.title}
                              onChange={(e) => setEditState(prev => ({ 
                                ...prev, 
                                title: e.target.value 
                              }))}
                            />
                          </div>
                          <div>
                            <Label htmlFor="edit-description">説明</Label>
                            <Textarea
                              id="edit-description"
                              value={editState.description}
                              onChange={(e) => setEditState(prev => ({ 
                                ...prev, 
                                description: e.target.value 
                              }))}
                              rows={3}
                            />
                          </div>
                          <div>
                            <Label htmlFor="edit-display-date">添付日付</Label>
                            <Input
                              id="edit-display-date"
                              type="date"
                              value={editState.displayDate}
                              onChange={(e) => setEditState(prev => ({
                                ...prev,
                                displayDate: e.target.value
                              }))}
                              className="w-48"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              未指定の場合は登録日が表示されます
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={editState.isPublic}
                              onCheckedChange={(checked) => setEditState(prev => ({
                                ...prev,
                                isPublic: checked
                              }))}
                            />
                            <Label>公開する</Label>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={closeEditDialog}>
                            キャンセル
                          </Button>
                          <Button onClick={handleUpdateFile}>
                            更新
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* 削除ボタン */}
                    <Dialog open={deleteState.isOpen && deleteState.file?.file_id === file.file_id}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDeleteDialog(file)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>ファイルを削除しますか？</DialogTitle>
                          <DialogDescription>
                            「{file.file_title}」を削除します。この操作は取り消せません。
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={closeDeleteDialog}>
                            キャンセル
                          </Button>
                          <Button 
                            onClick={handleDeleteFile}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            削除
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}