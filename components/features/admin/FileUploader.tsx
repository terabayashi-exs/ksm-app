// components/features/admin/FileUploader.tsx
// ファイルアップロードコンポーネント

'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Upload, File, X, CheckCircle, AlertCircle, Link as LinkIcon } from 'lucide-react';
import { FILE_VALIDATION, type LinkType } from '@/lib/types/tournament-files';

interface FileUploaderProps {
  tournamentId: number;
  onUploadSuccess?: () => void;
}

interface UploadState {
  linkType: LinkType;
  file: File | null;
  title: string;
  description: string;
  externalUrl: string;
  uploading: boolean;
  progress: number;
  error: string | null;
  success: boolean;
}

// ファイルサイズを人間が読みやすい形式に変換
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function FileUploader({ tournamentId, onUploadSuccess }: FileUploaderProps) {
  const [state, setState] = useState<UploadState>({
    linkType: 'upload',
    file: null,
    title: '',
    description: '',
    externalUrl: '',
    uploading: false,
    progress: 0,
    error: null,
    success: false
  });

  // ドロップゾーンの設定
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      // ファイル名からデフォルトタイトルを生成
      const defaultTitle = file.name.replace(/\.[^/.]+$/, ''); // 拡張子を除去
      
      setState(prev => ({
        ...prev,
        file,
        title: defaultTitle,
        error: null,
        success: false
      }));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxSize: FILE_VALIDATION.maxSize,
    multiple: false,
    onDropRejected: (rejectedFiles) => {
      const rejection = rejectedFiles[0];
      if (rejection.errors[0]?.code === 'file-too-large') {
        setState(prev => ({
          ...prev,
          error: `ファイルサイズが大きすぎます（最大: ${formatFileSize(FILE_VALIDATION.maxSize)}）`
        }));
      } else if (rejection.errors[0]?.code === 'file-invalid-type') {
        setState(prev => ({
          ...prev,
          error: 'PDFファイルのみアップロード可能です'
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: 'ファイルアップロードエラーが発生しました'
        }));
      }
    }
  });

  // ファイル削除
  const removeFile = () => {
    setState(prev => ({
      ...prev,
      file: null,
      title: '',
      description: '',
      error: null,
      success: false
    }));
  };

  // ファイルアップロード/外部URL登録実行
  const handleUpload = async () => {
    // バリデーション
    if (!state.title.trim()) {
      setState(prev => ({
        ...prev,
        error: 'タイトルは必須です'
      }));
      return;
    }

    if (state.linkType === 'upload' && !state.file) {
      setState(prev => ({
        ...prev,
        error: 'ファイルを選択してください'
      }));
      return;
    }

    if (state.linkType === 'external' && !state.externalUrl.trim()) {
      setState(prev => ({
        ...prev,
        error: '外部URLを入力してください'
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      uploading: true,
      progress: 0,
      error: null,
      success: false
    }));

    try {
      const formData = new FormData();
      formData.append('link_type', state.linkType);
      formData.append('title', state.title.trim());
      if (state.description.trim()) {
        formData.append('description', state.description.trim());
      }
      formData.append('upload_order', '0');

      if (state.linkType === 'upload' && state.file) {
        formData.append('file', state.file);
      } else if (state.linkType === 'external') {
        formData.append('external_url', state.externalUrl.trim());
      }

      // プログレス更新のシミュレーション
      const progressInterval = setInterval(() => {
        setState(prev => ({
          ...prev,
          progress: Math.min(prev.progress + 10, 90)
        }));
      }, 200);

      const response = await fetch(`/api/admin/tournaments/${tournamentId}/files/upload`, {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'アップロードに失敗しました');
      }

      setState(prev => ({
        ...prev,
        uploading: false,
        progress: 100,
        success: true,
        file: null,
        title: '',
        description: '',
        externalUrl: ''
      }));

      // 成功コールバック（即座に呼び出し）
      if (onUploadSuccess) {
        onUploadSuccess();
      }

      // 成功状態をリセット
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          success: false,
          progress: 0
        }));
      }, 3000);

    } catch (error) {
      setState(prev => ({
        ...prev,
        uploading: false,
        progress: 0,
        error: error instanceof Error ? error.message : 'アップロードに失敗しました'
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* リンクタイプ選択 */}
      <div className="flex gap-4 p-4 bg-gray-50 rounded-lg">
        <Button
          type="button"
          variant={state.linkType === 'upload' ? 'default' : 'outline'}
          onClick={() => setState(prev => ({ ...prev, linkType: 'upload', externalUrl: '', error: null }))}
          className="flex-1"
        >
          <Upload className="h-4 w-4 mr-2" />
          ファイルアップロード
        </Button>
        <Button
          type="button"
          variant={state.linkType === 'external' ? 'default' : 'outline'}
          onClick={() => setState(prev => ({ ...prev, linkType: 'external', file: null, error: null }))}
          className="flex-1"
        >
          <LinkIcon className="h-4 w-4 mr-2" />
          外部URLリンク
        </Button>
      </div>

      {/* ファイルアップロードモード */}
      {state.linkType === 'upload' && (
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
            ${state.file ? 'bg-green-50 border-green-300' : ''}
          `}
        >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center space-y-4">
          {state.file ? (
            <>
              <File className="h-12 w-12 text-green-600" />
              <div>
                <p className="text-lg font-medium text-green-800">{state.file.name}</p>
                <p className="text-sm text-green-600">
                  {formatFileSize(state.file.size)} - {state.file.type}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile();
                }}
              >
                <X className="h-4 w-4 mr-2" />
                ファイルを削除
              </Button>
            </>
          ) : (
            <>
              <Upload className="h-12 w-12 text-gray-400" />
              <div>
                <p className="text-lg font-medium text-gray-900">
                  {isDragActive ? 'ファイルをドロップしてください' : 'PDFファイルをドラッグ&ドロップ'}
                </p>
                <p className="text-sm text-gray-500">
                  または、クリックしてファイルを選択（最大 {formatFileSize(FILE_VALIDATION.maxSize)}）
                </p>
              </div>
            </>
          )}
        </div>
        </div>
      )}

      {/* 外部URLリンクモード */}
      {state.linkType === 'external' && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="external-url">外部URL *</Label>
            <Input
              id="external-url"
              type="url"
              value={state.externalUrl}
              onChange={(e) => setState(prev => ({ ...prev, externalUrl: e.target.value }))}
              placeholder="https://example.com/photos"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              写真アルバムや外部資料のURLを入力してください
            </p>
          </div>
        </div>
      )}

      {/* タイトル・説明入力（共通） */}
      {(state.file || state.linkType === 'external') && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="file-title">タイトル *</Label>
            <Input
              id="file-title"
              value={state.title}
              onChange={(e) => setState(prev => ({ ...prev, title: e.target.value }))}
              placeholder="例: 大会写真アルバム、駐車場案内"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="file-description">説明（オプション）</Label>
            <Textarea
              id="file-description"
              value={state.description}
              onChange={(e) => setState(prev => ({ ...prev, description: e.target.value }))}
              placeholder="内容や注意事項を記載してください"
              className="mt-1"
              rows={3}
            />
          </div>
        </div>
      )}

      {/* プログレスバー */}
      {state.uploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">アップロード中...</span>
            <span className="text-sm text-gray-600">{state.progress}%</span>
          </div>
          <Progress value={state.progress} className="h-2" />
        </div>
      )}

      {/* エラー表示 */}
      {state.error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-sm text-red-800">{state.error}</span>
        </div>
      )}

      {/* 成功表示 */}
      {state.success && (
        <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="text-sm text-green-800">
            {state.linkType === 'upload' ? 'ファイルのアップロードが完了しました' : '外部URLリンクの登録が完了しました'}
          </span>
        </div>
      )}

      {/* 登録ボタン */}
      {((state.linkType === 'upload' && state.file) || (state.linkType === 'external' && state.externalUrl.trim())) && !state.uploading && !state.success && (
        <Button
          onClick={handleUpload}
          disabled={!state.title.trim()}
          className="w-full"
          size="lg"
        >
          {state.linkType === 'upload' ? (
            <>
              <Upload className="h-4 w-4 mr-2" />
              ファイルをアップロード
            </>
          ) : (
            <>
              <LinkIcon className="h-4 w-4 mr-2" />
              外部URLを登録
            </>
          )}
        </Button>
      )}
    </div>
  );
}