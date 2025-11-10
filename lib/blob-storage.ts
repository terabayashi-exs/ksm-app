// lib/blob-storage.ts
import { put, del, head, list, type PutBlobResult } from '@vercel/blob';

/**
 * Vercel Blob ストレージ操作のラッパー
 */
export class BlobStorage {
  /**
   * ファイルを保存
   */
  static async put(
    pathname: string,
    data: string | Buffer | Blob | ReadableStream,
    options?: {
      contentType?: string;
      cacheControlMaxAge?: number;
    }
  ): Promise<PutBlobResult> {
    const startTime = performance.now();
    
    try {
      // データサイズを計算
      let dataSize = 0;
      if (typeof data === 'string') {
        dataSize = Buffer.byteLength(data, 'utf8');
      } else if (data instanceof Buffer) {
        dataSize = data.length;
      } else if (data instanceof Blob) {
        dataSize = data.size;
      }

      const result = await put(pathname, data, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: options?.contentType || 'application/json',
        cacheControlMaxAge: options?.cacheControlMaxAge || 31536000, // 1 year
      });
      
      const duration = Math.round(performance.now() - startTime);
      console.log(`✅ Blob saved: ${pathname} (${(dataSize / 1024).toFixed(2)} KB, ${duration}ms)`);
      
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const errorDetails = this.getErrorDetails(error);
      console.error(`❌ Blob save failed: ${pathname} (${duration}ms)`, {
        error: errorDetails,
        pathname,
        dataSize: typeof data === 'string' ? `${Buffer.byteLength(data, 'utf8')} bytes` : 'unknown'
      });
      throw this.enhanceError(error, 'PUT', pathname);
    }
  }

  /**
   * ファイルを取得
   */
  static async get(pathname: string): Promise<Response> {
    const startTime = performance.now();
    
    try {
      // Blobの直接URLを構築する方法
      const blobUrl = await this.getBlobUrl(pathname);
      const response = await fetch(blobUrl);
      
      if (!response.ok) {
        throw new Error(`Blob not found: ${pathname} (Status: ${response.status})`);
      }
      
      const duration = Math.round(performance.now() - startTime);
      const contentLength = response.headers.get('content-length');
      const sizeInfo = contentLength ? ` (${(parseInt(contentLength) / 1024).toFixed(2)} KB)` : '';
      
      console.log(`✅ Blob retrieved: ${pathname}${sizeInfo} (${duration}ms)`);
      
      return response;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      
      // 404エラーの場合はログを出力しない
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (!errorMessage.includes('404') && !errorMessage.includes('does not exist')) {
        console.error(`❌ Blob get failed: ${pathname} (${duration}ms)`, this.getErrorDetails(error));
      }
      
      throw this.enhanceError(error, 'GET', pathname);
    }
  }

  /**
   * JSONファイルを取得（リトライ機能付き）
   */
  static async getJson<T>(pathname: string, retryCount = 0): Promise<T> {
    const maxRetries = 2;
    
    try {
      const response = await this.get(pathname);
      return response.json() as Promise<T>;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // 404エラーで、まだリトライ回数が残っている場合（ログなし）
      if ((errorMessage.includes('404') || errorMessage.includes('does not exist')) && retryCount < maxRetries) {
        const delay = (retryCount + 1) * 300; // 300ms, 600ms
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.getJson<T>(pathname, retryCount + 1);
      }
      
      // リトライ上限に達した、または他のエラー
      throw error;
    }
  }

  /**
   * ファイルの存在確認
   */
  static async exists(pathname: string): Promise<boolean> {
    try {
      await head(pathname);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ファイルを削除
   */
  static async delete(pathname: string): Promise<void> {
    const startTime = performance.now();
    
    try {
      await del(pathname);
      const duration = Math.round(performance.now() - startTime);
      console.log(`✅ Blob deleted: ${pathname} (${duration}ms)`);
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      console.error(`❌ Blob delete failed: ${pathname} (${duration}ms)`, this.getErrorDetails(error));
      throw this.enhanceError(error, 'DELETE', pathname);
    }
  }

  /**
   * ファイル一覧を取得
   */
  static async list(options?: {
    prefix?: string;
    limit?: number;
  }): Promise<string[]> {
    try {
      const { blobs } = await list({
        prefix: options?.prefix,
        limit: options?.limit || 1000,
      });
      
      return blobs.map(blob => blob.pathname);
    } catch (error) {
      console.error('❌ Blob list failed:', error);
      throw error;
    }
  }

  /**
   * BlobのURLを取得（内部メソッド）
   */
  private static async getBlobUrl(pathname: string): Promise<string> {
    try {
      // headでメタデータを取得してURLを取得
      const metadata = await head(pathname);
      return metadata.url;
    } catch {
      // head操作が失敗した場合は再試行（ログなし）
      await new Promise(resolve => setTimeout(resolve, 200));
      const metadata = await head(pathname);
      return metadata.url;
    }
  }

  /**
   * JSONデータを圧縮して保存
   */
  static async putJson(
    pathname: string,
    data: Record<string, unknown>,
    options?: {
      cacheControlMaxAge?: number;
    }
  ): Promise<PutBlobResult> {
    const jsonString = JSON.stringify(data, null, 2);
    return this.put(pathname, jsonString, {
      contentType: 'application/json',
      ...options,
    });
  }

  /**
   * 楽観的ロックでJSONを更新
   */
  static async updateJsonWithLock<T>(
    pathname: string,
    updateFn: (current: T) => T | Promise<T>,
    options?: {
      maxRetries?: number;
      defaultValue?: T;
    }
  ): Promise<void> {
    const maxRetries = options?.maxRetries || 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // 現在のデータを取得（head操作を使わず直接取得を試行）
        let currentData: T;
        try {
          currentData = await this.getJson<T>(pathname);
        } catch (error) {
          // ファイルが存在しない場合（404）またはその他のエラー
          const errorDetails = this.getErrorDetails(error);
          if (!(error instanceof Error && (error.message.includes('404') || error.message.includes('does not exist')))) {
            console.warn(`⚠️ ファイル読み取りエラー、デフォルト値使用: ${pathname}`, errorDetails);
          }
          currentData = options?.defaultValue || ({} as T);
        }

        // データを更新
        const newData = await updateFn(currentData);

        // 保存
        await this.putJson(pathname, newData as Record<string, unknown>);
        return;
      } catch (error) {
        retries++;
        console.error(`❌ JSON更新失敗 ${retries}/${maxRetries}: ${pathname}`, this.getErrorDetails(error));
        
        if (retries >= maxRetries) {
          const duration = performance.now();
          throw new Error(`Failed to update JSON after ${maxRetries} retries: ${pathname} (${Math.round(duration)}ms)`);
        }
        
        // 指数バックオフでリトライ（ログなし）
        const delay = Math.min(1000 * Math.pow(2, retries - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * エラー詳細を取得
   */
  private static getErrorDetails(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n') // スタックトレースの最初の3行のみ
      };
    }
    return { raw: error };
  }

  /**
   * エラーを拡張（追加情報付与）
   */
  private static enhanceError(error: unknown, operation: string, pathname: string): Error {
    const baseMessage = error instanceof Error ? error.message : 'Unknown error';
    const enhancedError = new Error(`Blob ${operation} failed for '${pathname}': ${baseMessage}`);
    
    // 元のエラーの情報を保持
    if (error instanceof Error) {
      enhancedError.stack = error.stack;
      (enhancedError as unknown as Record<string, unknown>).originalError = error;
    }
    
    (enhancedError as unknown as Record<string, unknown>).operation = operation;
    (enhancedError as unknown as Record<string, unknown>).pathname = pathname;
    (enhancedError as unknown as Record<string, unknown>).timestamp = new Date().toISOString();
    
    return enhancedError;
  }

  /**
   * ヘルスチェック
   */
  static async healthCheck(): Promise<{
    healthy: boolean;
    latency_ms: number;
    error?: string;
  }> {
    const testPath = `health-check/${Date.now()}.json`;
    const testData = { timestamp: new Date().toISOString(), test: true };
    
    try {
      const startTime = performance.now();
      
      // 書き込みテスト
      await this.putJson(testPath, testData);
      
      // 読み取りテスト
      const retrieved = await this.getJson(testPath);
      
      // 削除テスト
      await this.delete(testPath);
      
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      // データ整合性チェック
      if ((retrieved as Record<string, unknown>).timestamp !== testData.timestamp) {
        throw new Error('Data integrity check failed');
      }
      
      return {
        healthy: true,
        latency_ms: latency
      };
      
    } catch (error) {
      return {
        healthy: false,
        latency_ms: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}