// lib/db-fallback.ts
// 環境変数が読み込まれない場合の一時的なフォールバック

import { createClient, Client } from "@libsql/client";

// 一時的なフォールバック設定
const FALLBACK_CONFIG = {
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
};

let dbInstance: Client | null = null;

// データベースクライアントを取得（フォールバック付き）
const getDbClient = (): Client => {
  if (dbInstance) {
    return dbInstance;
  }

  // 環境変数を試行
  let url = process.env.DATABASE_URL;
  let authToken = process.env.DATABASE_AUTH_TOKEN;

  // 環境変数が取得できない場合はフォールバックを使用
  if (!url || !authToken) {
    console.warn('Environment variables not found, using fallback configuration');
    url = FALLBACK_CONFIG.url;
    authToken = FALLBACK_CONFIG.authToken;
  } else {
    console.log('Using environment variables for database connection');
  }

  console.log('Database client initializing:', { 
    url: url.substring(0, 30) + '...', 
    hasToken: !!authToken,
    source: process.env.DATABASE_URL ? 'env' : 'fallback'
  });

  dbInstance = createClient({
    url,
    authToken,
  });

  return dbInstance;
};

// エクスポート用のProxy
export const db = new Proxy({} as Client, {
  get(target, prop) {
    const client = getDbClient();
    const value = client[prop as keyof Client];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});