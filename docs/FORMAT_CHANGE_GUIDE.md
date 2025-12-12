# フォーマット変更機能 実装ガイド

## 概要

大会のフォーマット（24チーム→27チームなど）を変更する機能です。
試合結果が既に入力されている場合は変更を禁止し、データの整合性を保護します。

## API仕様

### 1. フォーマット変更可否チェック（GET）

**エンドポイント**: `GET /api/admin/tournaments/[id]/change-format`

**レスポンス例（変更可能）**:
```json
{
  "success": true,
  "data": {
    "tournament_id": 1,
    "tournament_name": "第1回PK選手権",
    "current_format_id": 1,
    "current_format_name": "24チーム予選+決勝",
    "tournament_status": "recruiting",
    "can_change": true,
    "match_status": {
      "total_matches": 0,
      "completed_matches": 0,
      "confirmed_matches": 0,
      "has_results": false
    },
    "reasons": []
  }
}
```

**レスポンス例（変更不可）**:
```json
{
  "success": true,
  "data": {
    "tournament_id": 1,
    "tournament_name": "第1回PK選手権",
    "current_format_id": 1,
    "current_format_name": "24チーム予選+決勝",
    "tournament_status": "recruiting",
    "can_change": false,
    "match_status": {
      "total_matches": 64,
      "completed_matches": 5,
      "confirmed_matches": 3,
      "has_results": true
    },
    "reasons": [
      "試合結果が既に入力されています（完了: 5試合, 確定: 3試合）"
    ]
  }
}
```

### 2. フォーマット変更実行（PUT）

**エンドポイント**: `PUT /api/admin/tournaments/[id]/change-format`

**リクエストBody**:
```json
{
  "new_format_id": 2,
  "confirmation": true
}
```

**成功レスポンス**:
```json
{
  "success": true,
  "message": "フォーマット変更が完了しました。組合せ抽選画面から新しいフォーマットで組合せを作成してください。",
  "data": {
    "tournament_id": 1,
    "tournament_name": "第1回PK選手権",
    "old_format_id": 1,
    "old_format_name": "24チーム予選+決勝",
    "new_format_id": 2,
    "new_format_name": "27チーム予選+決勝",
    "target_team_count": 27,
    "deleted_data": {
      "matches_final": 0,
      "matches_live": 64,
      "match_blocks": 4,
      "match_overrides": 0,
      "reset_teams": 24
    }
  }
}
```

**エラーレスポンス（試合結果が存在）**:
```json
{
  "success": false,
  "error": "試合結果が既に入力されているため、フォーマット変更できません",
  "details": {
    "reason": "MATCH_RESULTS_EXIST",
    "message": "試合が開始され、結果が入力されている大会はフォーマット変更できません。",
    "matchCount": 64,
    "completedCount": 5,
    "confirmedCount": 3,
    "suggestion": "新しい大会を作成するか、全ての試合結果を削除してから再度お試しください。"
  }
}
```

**エラーレスポンス（大会ステータス不正）**:
```json
{
  "success": false,
  "error": "進行中の大会はフォーマット変更できません",
  "details": {
    "reason": "INVALID_TOURNAMENT_STATUS",
    "current_status": "ongoing",
    "message": "大会のステータスが「計画中」または「募集中」の場合のみフォーマット変更が可能です。"
  }
}
```

## 変更可能条件

### ✅ 変更可能な条件

1. **試合結果が存在しない**
   - `t_matches_live.match_status` が `'completed'` または `'ongoing'` の試合が0件
   - `t_matches_final` に確定済み試合が0件

2. **大会ステータスが適切**
   - `t_tournaments.status` が `'planning'`（計画中）または `'recruiting'`（募集中）

### ❌ 変更不可の条件

1. **試合結果が既に存在**
   - 少なくとも1試合が完了（`match_status = 'completed'` または `'ongoing'`）
   - 少なくとも1試合が確定（`t_matches_final` に存在）

2. **大会が進行中・完了済み**
   - `status = 'ongoing'`（進行中）
   - `status = 'completed'`（完了済み）

## データ影響範囲

### 削除されるテーブル

| テーブル | 削除内容 | 影響 |
|----------|----------|------|
| `t_matches_final` | 全確定済み試合結果 | 試合結果が失われる |
| `t_matches_live` | 全試合データ | 予定されている試合が失われる |
| `t_match_blocks` | 全ブロック情報 | ブロック構成が失われる |
| `t_tournament_match_overrides` | 進出条件オーバーライド | カスタム設定が失われる |

### リセットされるフィールド

| テーブル | フィールド | リセット後の値 |
|----------|-----------|---------------|
| `t_tournament_teams` | `assigned_block` | `NULL` |
| `t_tournament_teams` | `block_position` | `NULL` |

### 保持されるデータ

| テーブル | 保持内容 |
|----------|----------|
| `t_tournament_teams` | 参加チーム情報（チーム名・略称・登録方法など） |
| `t_tournament_players` | 参加選手情報（全選手データ） |
| `t_tournaments` | 大会基本情報（`format_id` のみ更新） |

## フロントエンド実装例

### React コンポーネントでの使用例

```typescript
'use client';

import { useState } from 'react';
import { checkFormatChangeEligibility, changeFormat } from '@/lib/format-change';
import { FormatChangeDialog } from '@/components/features/tournament/FormatChangeDialog';

export function TournamentEditPage({ tournamentId }: { tournamentId: number }) {
  const [showDialog, setShowDialog] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newFormatId, setNewFormatId] = useState<number | null>(null);
  const [newFormatName, setNewFormatName] = useState<string>('');

  // フォーマット変更ボタンクリック時
  const handleFormatChangeClick = async (formatId: number, formatName: string) => {
    setIsProcessing(true);

    // 変更可否チェック
    const result = await checkFormatChangeEligibility(tournamentId);

    if (result.success && result.data) {
      setCheckResult(result.data);
      setNewFormatId(formatId);
      setNewFormatName(formatName);
      setShowDialog(true);
    } else {
      alert('チェックに失敗しました: ' + result.error);
    }

    setIsProcessing(false);
  };

  // フォーマット変更確定
  const handleConfirmChange = async () => {
    if (!newFormatId) return;

    setIsProcessing(true);

    const result = await changeFormat(tournamentId, newFormatId, true);

    if (result.success) {
      alert(result.message);
      setShowDialog(false);
      // ページをリロードして最新状態を反映
      window.location.reload();
    } else {
      alert('変更に失敗しました: ' + result.error);
    }

    setIsProcessing(false);
  };

  return (
    <div>
      {/* フォーマット選択UI */}
      <select onChange={(e) => {
        const option = e.target.selectedOptions[0];
        handleFormatChangeClick(
          parseInt(e.target.value),
          option.text
        );
      }}>
        <option value="">フォーマットを選択...</option>
        <option value="1">24チーム予選+決勝</option>
        <option value="2">27チーム予選+決勝</option>
        <option value="3">32チーム予選+決勝</option>
      </select>

      {/* 確認ダイアログ */}
      {showDialog && checkResult && (
        <FormatChangeDialog
          checkResult={checkResult}
          newFormatName={newFormatName}
          onConfirm={handleConfirmChange}
          onCancel={() => setShowDialog(false)}
          isProcessing={isProcessing}
        />
      )}
    </div>
  );
}
```

## セキュリティ考慮事項

1. **認証・認可**
   - 管理者権限（`role = 'admin'`）必須
   - セッションチェック実施

2. **データ整合性**
   - トランザクション的な削除処理（外部キー制約順序を考慮）
   - 削除前の存在チェック

3. **エラーハンドリング**
   - 試合結果存在チェック
   - 大会ステータスチェック
   - 詳細なエラーメッセージ返却

## 運用上の注意事項

### ⚠️ 変更前の確認事項

1. **バックアップ推奨**
   - 大会データのバックアップを推奨
   - 特に試合結果が入力されている場合

2. **参加者への通知**
   - フォーマット変更は参加チームに影響する可能性
   - 事前に参加者へ通知することを推奨

3. **代替案の検討**
   - 試合結果が入力済みの場合は新規大会作成を推奨
   - データ移行が必要な場合は個別対応

### ✅ 変更後の手順

1. **組合せ抽選画面へ移動**
   - 新しいフォーマットで組合せを作成

2. **チーム配置の確認**
   - ブロック配置が適切か確認

3. **試合スケジュール調整**
   - コート数・時間設定の見直し

4. **オーバーライド設定**
   - 必要に応じて進出条件のカスタマイズ

## トラブルシューティング

### Q: フォーマット変更後に組合せが表示されない

**A**: 変更後は組合せ情報が削除されるため、組合せ抽選画面から再作成が必要です。

### Q: 試合結果が1件も入力されていないのに変更できない

**A**: 以下を確認してください：
- 大会ステータスが `'planning'` または `'recruiting'` か
- `t_matches_live.match_status` が全て `'scheduled'` か
- `t_matches_final` にレコードが存在しないか

### Q: 変更を強制実行したい

**A**: 以下の手順で手動削除が必要です（推奨しません）：
```sql
-- 1. 確定済み試合削除
DELETE FROM t_matches_final WHERE match_id IN (
  SELECT ml.match_id FROM t_matches_live ml
  JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
  WHERE mb.tournament_id = ?
);

-- 2. ライブ試合削除
DELETE FROM t_matches_live WHERE match_block_id IN (
  SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
);

-- 3. ブロック削除
DELETE FROM t_match_blocks WHERE tournament_id = ?;

-- 4. オーバーライド削除
DELETE FROM t_tournament_match_overrides WHERE tournament_id = ?;

-- 5. チーム情報リセット
UPDATE t_tournament_teams SET
  assigned_block = NULL,
  block_position = NULL
WHERE tournament_id = ?;

-- 6. フォーマット更新
UPDATE t_tournaments SET format_id = ? WHERE tournament_id = ?;
```

## まとめ

フォーマット変更機能は以下の特徴を持ちます：

✅ **安全性**: 試合結果が存在する場合は変更不可
✅ **整合性**: 関連データの適切な削除・リセット
✅ **柔軟性**: 参加チーム情報は保持したまま構成変更
✅ **透明性**: 詳細な変更内容・影響範囲の表示

適切に使用することで、大会準備段階でのフォーマット変更を安全に実行できます。
