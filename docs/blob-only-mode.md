# Blob専用モードの設定

## 概要

現在の実装は「デュアル保存」（Blob + DB両方）ですが、完全にBlobのみに移行したい場合の設定方法を説明します。

## 現在の動作

```typescript
// 現在: デュアル保存
if (blobResult.success) {
  await archiveTournamentAsJson(tournamentId, archivedBy); // DB保存も実行
  return { storage_type: 'blob' };
}
```

## Blob専用モードへの変更

### 方法1: 環境変数による制御（推奨）

`.env.local`に以下を追加：

```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxxxxx
ARCHIVE_STORAGE_MODE=blob_only  # 新しい環境変数
```

そして、アーカイブAPIを以下のように修正：

```typescript
// app/api/tournaments/[id]/archive/route.ts
const storageMode = process.env.ARCHIVE_STORAGE_MODE || 'dual'; // dual | blob_only | db_only

if (useBlobStorage) {
  const blobResult = await TournamentBlobArchiver.archiveTournament(tournamentId, archivedBy);
  
  if (blobResult.success) {
    // Blob専用モードの場合はDB保存をスキップ
    if (storageMode !== 'blob_only') {
      await archiveTournamentAsJson(tournamentId, archivedBy);
    }
    
    return NextResponse.json({
      success: true,
      message: `アーカイブが正常に作成されました（${storageMode}モード）`,
      data: blobResult.data,
      storage_type: 'blob'
    });
  }
}
```

### 方法2: コード直接修正

アーカイブAPIから以下の行をコメントアウト：

```typescript
// 以下をコメントアウト
// await archiveTournamentAsJson(tournamentId, archivedBy);
```

## 各モードの比較

| モード | Blob保存 | DB保存 | メリット | デメリット |
|--------|----------|--------|----------|------------|
| **dual**（現在） | ✅ | ✅ | 冗長性・安全性 | ストレージ重複 |
| **blob_only** | ✅ | ❌ | 効率的・高速 | バックアップなし |
| **db_only** | ❌ | ✅ | 従来通り | 性能劣化 |

## 推奨設定

### テスト期間中
```bash
ARCHIVE_STORAGE_MODE=dual  # デュアル保存で安全性確保
```

### 本番運用後
```bash
ARCHIVE_STORAGE_MODE=blob_only  # Blob専用で効率化
```

## 既存データへの影響

- **新規アーカイブ**: 設定に従う
- **既存アーカイブ**: 影響なし（引き続き表示可能）
- **読み取り**: Blob優先で自動的に高速化

## 注意点

1. **blob_only**モードでは、Blob障害時にデータが失われる可能性
2. 重要な大会は手動でDBバックアップを推奨
3. 移行期間中は**dual**モードを推奨