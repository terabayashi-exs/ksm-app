# Vercel Blob Storage セットアップガイド

## 概要
このガイドでは、KSM-Appで大会アーカイブをVercel Blobに保存するための設定手順を説明します。

## 前提条件
- Vercelアカウントを持っていること
- プロジェクトがVercelにデプロイされていること

## セットアップ手順

### 1. Vercel Blob Storageの有効化

1. [Vercel Dashboard](https://vercel.com/dashboard)にログイン
2. プロジェクトを選択
3. 「Storage」タブをクリック
4. 「Create Database」→「Blob」を選択
5. データベース名を入力（例: `ksm-blob-storage`）
6. 「Create」をクリック

### 2. 環境変数の取得

Blob Storageを作成すると、以下の環境変数が自動的に生成されます：

- `BLOB_READ_WRITE_TOKEN`: 読み書き用のアクセストークン

### 3. ローカル開発環境の設定

`.env.local`ファイルに以下を追加：

```bash
# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxxxxx
```

**注意**: 実際のトークンはVercel Dashboardから取得してください。

### 4. 本番環境の設定

Vercelにデプロイされたプロジェクトでは、環境変数は自動的に設定されます。
手動で設定が必要な場合：

1. Vercel Dashboard → Settings → Environment Variables
2. 「Add New」をクリック
3. Key: `BLOB_READ_WRITE_TOKEN`
4. Value: 取得したトークン値
5. Environment: Production / Preview / Development を選択

## 動作確認

### テスト用エンドポイント

以下のエンドポイントで動作を確認できます：

```bash
# 1. 書き込みテスト
curl -X POST http://localhost:3000/api/test/blob

# 2. 読み取りテスト
curl http://localhost:3000/api/test/blob

# 3. 詳細テスト（全機能）
curl -X PUT http://localhost:3000/api/test/blob

# 4. 削除テスト
curl -X DELETE http://localhost:3000/api/test/blob
```

### 正常な応答例

```json
{
  "success": true,
  "message": "Blobへのデータ書き込みに成功しました",
  "result": {
    "pathname": "test/hello-blob.json",
    "contentType": "application/json",
    "url": "https://xxxxxxxxx.public.blob.vercel-storage.com/test/hello-blob.json"
  }
}
```

## トラブルシューティング

### エラー: "Failed to put blob"
- `BLOB_READ_WRITE_TOKEN`が正しく設定されているか確認
- トークンの前後に余分なスペースがないか確認

### エラー: "Blob not found"
- ファイルが存在することを確認
- パスが正しいか確認（大文字小文字の区別あり）

### ローカルでの開発
- `.env.local`ファイルがプロジェクトルートにあることを確認
- `npm run dev`でサーバーを再起動

## Blob Storage の制限事項

- ファイルサイズ: 最大 500MB
- ストレージ容量: プランによる（Hobbyプラン: 1GB）
- 帯域幅: プランによる制限あり

## セキュリティ上の注意

1. `BLOB_READ_WRITE_TOKEN`は秘密情報です
2. `.env.local`は`.gitignore`に含まれていることを確認
3. トークンを公開リポジトリにコミットしない
4. クライアントサイドのコードにトークンを含めない

## Phase 1 実装状況

✅ 実装完了項目：
- Vercel Blobパッケージのインストール
- BlobStorage基本ラッパー (`lib/blob-storage.ts`)
- TournamentBlobArchiver実装 (`lib/tournament-blob-archiver.ts`)
- テスト用APIエンドポイント (`/api/test/blob`)
- 環境変数設定ガイド（本ドキュメント）

これで、Phase 1（基盤構築）が完了しました。

## 次のステップ（Phase 2）

Phase 2では、実際の大会アーカイブ機能をBlobに移行します：
- 新規アーカイブをBlobに保存
- 既存の読み取りAPIをBlob対応
- DBとBlobの並行運用