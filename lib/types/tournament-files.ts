// lib/types/tournament-files.ts
// 大会ファイル管理の型定義

export interface TournamentFile {
  file_id: number;
  tournament_id: number;
  file_title: string;
  file_description?: string;
  original_filename: string;
  blob_url: string;
  file_size: number;
  mime_type: string;
  upload_order: number;
  is_public: boolean;
  uploaded_by: string;
  uploaded_at: string;
  updated_at: string;
}

export interface FileUploadRequest {
  file: File;
  title: string;
  description?: string;
  upload_order?: number;
}

export interface FileUploadResponse {
  success: boolean;
  data?: {
    file_id: number;
    file_title: string;
    blob_url: string;
    file_size: number;
  };
  error?: string;
}

export interface FileListResponse {
  success: boolean;
  data?: {
    files: TournamentFile[];
    total_count: number;
    total_size: number;
  };
  error?: string;
}

export interface FileDeleteResponse {
  success: boolean;
  error?: string;
}

// ファイルバリデーション設定
export const FILE_VALIDATION = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['application/pdf'],
  allowedExtensions: ['.pdf'],
  maxFilesPerTournament: 20,
  maxTotalSizePerTournament: 100 * 1024 * 1024 // 100MB
} as const;

// エラー定義
export type FileUploadError = 
  | 'FILE_TOO_LARGE'
  | 'INVALID_TYPE'
  | 'UPLOAD_FAILED'
  | 'STORAGE_FULL'
  | 'TOO_MANY_FILES'
  | 'TOTAL_SIZE_EXCEEDED';