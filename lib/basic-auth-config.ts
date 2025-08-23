// lib/basic-auth-config.ts
export const basicAuthConfig = {
  // BASIC認証を適用するパス（本番環境のみ）
  protectedPaths: [
    // 全サイトを保護する場合
    '/',
    
    // 特定パスのみ保護する場合（例）
    // '/admin',
    // '/team',
    // '/public/tournaments'
  ],
  
  // BASIC認証を除外するパス
  excludedPaths: [
    '/_next',          // Next.js静的ファイル
    '/favicon.ico',    // ファビコン
    '/api/health',     // ヘルスチェック（監視用）
  ],
  
  // 環境別設定
  environments: {
    development: false,  // 開発環境では無効
    preview: true,       // プレビュー環境では有効
    production: true     // 本番環境では有効
  }
};

/**
 * パスがBASIC認証対象かチェック
 */
export function shouldApplyBasicAuth(pathname: string, environment: string): boolean {
  // 環境チェック
  if (!basicAuthConfig.environments[environment as keyof typeof basicAuthConfig.environments]) {
    return false;
  }

  // 除外パスチェック
  if (basicAuthConfig.excludedPaths.some(path => pathname.startsWith(path))) {
    return false;
  }

  // 保護対象パスチェック
  return basicAuthConfig.protectedPaths.some(path => {
    if (path === '/') {
      return true; // ルートパスは全てのパスにマッチ
    }
    return pathname.startsWith(path);
  });
}