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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Download, 
  Edit, 
  Trash2, 
  Eye, 
  EyeOff, 
  ExternalLink,
  FileText,
  RefreshCw
} from 'lucide-react';
import { type TournamentFile } from '@/lib/types/tournament-files';

interface FileManagementTableProps {
  tournamentId: number;
  refreshTrigger?: number; // 外部から更新をトリガーするための props
}

interface EditState {
  isOpen: boolean;
  file: TournamentFile | null;
  title: string;
  description: string;
  isPublic: boolean;
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

export default function FileManagementTable({ tournamentId, refreshTrigger }: FileManagementTableProps) {
  const [files, setFiles] = useState<TournamentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editState, setEditState] = useState<EditState>({
    isOpen: false,
    file: null,
    title: '',
    description: '',
    isPublic: true
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
      isPublic: file.is_public
    });
  };

  // 編集ダイアログを閉じる
  const closeEditDialog = () => {
    setEditState({
      isOpen: false,
      file: null,
      title: '',
      description: '',
      isPublic: true
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
          is_public: editState.isPublic,
          upload_order: editState.file.upload_order
        })
      });

      const result = await response.json();

      if (result.success) {
        await fetchFiles(); // ファイル一覧を更新
        closeEditDialog();
      } else {
        alert('更新に失敗しました: ' + result.error);
      }
    } catch (error) {
      console.error('ファイル更新エラー:', error);
      alert('更新に失敗しました');
    }
  };

  // ファイルを削除
  const handleDeleteFile = async (fileId: number) => {
    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/files/${fileId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        await fetchFiles(); // ファイル一覧を更新
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
          is_public: !file.is_public,
          upload_order: file.upload_order
        })
      });

      const result = await response.json();

      if (result.success) {
        await fetchFiles(); // ファイル一覧を更新
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
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">読み込み中...</span>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">まだファイルがアップロードされていません</p>
        <p className="text-sm text-muted-foreground mt-2">
          上記のアップロードエリアを使用してファイルを追加してください
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 更新ボタン */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{files.length}件のファイル</p>
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
              <TableHead>アップロード日時</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
              <TableRow key={file.file_id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{file.file_title}</div>
                    <div className="text-sm text-muted-foreground">
                      {file.original_filename}
                    </div>
                    {file.file_description && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {file.file_description}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{formatFileSize(file.file_size)}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={file.is_public}
                      onCheckedChange={() => togglePublicStatus(file)}
                    />
                    <span className="text-sm">
                      {file.is_public ? (
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
                  <span className="text-sm">{formatDate(file.uploaded_at)}</span>
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
                        download={file.original_filename}
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
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>ファイルを削除しますか？</AlertDialogTitle>
                          <AlertDialogDescription>
                            「{file.file_title}」を削除します。この操作は取り消せません。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>キャンセル</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteFile(file.file_id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            削除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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