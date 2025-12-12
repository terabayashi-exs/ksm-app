# team1_scores / team2_scores データ形式の不整合問題 - 調査レポート

**作成日**: 2025年12月12日
**重要度**: 高（データ整合性に影響）

## 📋 問題の概要

データベース内の `t_matches_live` と `t_matches_final` テーブルにおいて、`team1_scores` と `team2_scores` フィールドに**3つの異なる形式**のデータが混在しています：

1. **JSON配列形式**: `"[0]"`, `"[2,1]"` (167件)
2. **数値のみ形式**: `"2"`, `"3"` (120件)
3. **カンマ区切り形式**: `"2,1"`, `"0,0"` (未検出だが、コードで想定)

## 🔍 データベースの現状

### 実際のデータ分析結果

```
=== スコア形式の分類 ===
形式別の件数:
  JSON配列: 167件
  数値のみ: 120件
```

### サンプルデータ

**t_matches_live**:
- Match 3167 (A1): team1_scores: `"[0]"` (JSON配列)
- Match 3170 (D1): team1_scores: `"2"` (数値のみ)
- Match 3171 (E1): team1_scores: `"3"` (数値のみ)

**t_matches_final**:
- Match 3168 (B1): team1_scores: `"0"` (数値のみ)
- Match 3173 (A2): team1_scores: `"2"` (数値のみ)

## 🐛 原因の特定

### 1. 保存処理の不統一

#### ❌ カンマ区切りで保存する箇所

**`app/api/matches/[id]/status/route.ts:180-186`**
```typescript
// スコア・結果更新
if (team1_scores && team2_scores) {
  // ピリオド別スコアをカンマ区切りで保存
  const team1ScoresStr = Array.isArray(team1_scores)
    ? team1_scores.map(score => Math.floor(score || 0)).join(',')  // ← カンマ区切り
    : String(Math.floor(team1_scores || 0));
  const team2ScoresStr = Array.isArray(team2_scores)
    ? team2_scores.map(score => Math.floor(score || 0)).join(',')  // ← カンマ区切り
    : String(Math.floor(team2_scores || 0));
```

**使用API**:
- 試合状態更新 (`PUT /api/matches/[id]/status`)
- 審判UIから呼ばれる主要なエンドポイント

---

#### ✅ JSON形式で保存する箇所

**`app/api/matches/[id]/scores-extended/route.ts:265-266`**
```typescript
await db.execute(`
  UPDATE t_matches_live
  SET
    team1_scores = ?,
    team2_scores = ?,
    ...
`, [
  JSON.stringify(team1Scores),  // ← JSON形式
  JSON.stringify(team2Scores),  // ← JSON形式
  ...
]);
```

**使用API**:
- 拡張スコア更新 (`PUT /api/matches/[id]/scores-extended`)
- サッカー専用の複数ピリオド対応API

---

### 2. 読み取り処理の不統一

#### カンマ区切りを前提とした読み取り

**多数のファイル**:
- `app/api/matches/[id]/status/route.ts:87-88, 269-270`
- `app/api/matches/[id]/qr/route.ts:223-227, 325-329`
- `app/api/matches/[id]/confirm/route.ts:114, 118`
- `app/admin/tournaments/[id]/matches/page.tsx:901, 909`
- `lib/match-results-calculator.ts:40-44`
- `lib/tournament-blob-archiver.ts:422`
- `components/features/archived/v2.0/ArchivedLayout_v2.tsx:266`

```typescript
// 典型的なパターン
team1_scores: match.team1_scores ? String(match.team1_scores).split(',').map(...) : null
```

---

#### JSON形式を前提とした読み取り

**一部のファイル**:
- `app/api/matches/[id]/scores-extended/route.ts:80, 86, 93, 101`
- `app/admin/tournaments/[id]/matches/page.tsx:732-733`

```typescript
// JSON.parseを使用
team1Scores = JSON.parse(match.team1_scores);
```

しかし、`scores-extended/route.ts`では**フォールバック処理**があり、JSON Parse失敗時にカンマ区切りを試行するロジックはありません。

---

### 3. 数値のみ形式が存在する理由

**`app/api/matches/[id]/status/route.ts:183-186`**
```typescript
const team1ScoresStr = Array.isArray(team1_scores)
  ? team1_scores.map(score => Math.floor(score || 0)).join(',')
  : String(Math.floor(team1_scores || 0));  // ← 配列でない場合は数値のみ
```

**原因**:
- 審判UIから単一スコア（数値）が送られた場合、配列でないため`String(数値)`になる
- 例: `team1_scores: 2` → 保存値: `"2"`

---

## 🚨 影響範囲

### 1. データの不整合
- 同じテーブル内で異なる形式のデータが混在
- 新規作成される試合と既存試合で形式が異なる可能性

### 2. 機能への影響

#### ✅ 正常に動作する可能性が高い箇所
- **カンマ区切り読み取り処理**: `"2"` も `"2,1"` も `.split(',')` でパース可能
- **JSON Parse処理** (`scores-extended`): try-catchでエラーハンドリングあり

#### ⚠️ 問題が発生する可能性がある箇所
- **順位表計算**: `lib/match-results-calculator.ts`のparseScore関数はカンマ区切り前提
  - JSON配列 `"[2,1]"` を読むと、`.includes(',')` がtrueになり誤動作
- **戦績表表示**: アーカイブ表示等でスコア集計が不正確になる可能性
- **PDF生成**: スコア表示が正しくない可能性

### 3. 今後の開発への影響
- 新機能追加時に形式を意識する必要がある
- テストデータの作成が困難

---

## 💡 修正提案

### 推奨案: JSON形式への統一

#### 理由
1. **拡張性**: 複数ピリオド、複数競技への対応が容易
2. **型安全性**: TypeScriptの型定義と整合性が高い（`number[]`）
3. **明示性**: データ構造が明確

#### 実装方針

##### Phase 1: 新規データの統一
1. **`app/api/matches/[id]/status/route.ts`を修正**
   ```typescript
   // 修正前
   const team1ScoresStr = Array.isArray(team1_scores)
     ? team1_scores.map(score => Math.floor(score || 0)).join(',')
     : String(Math.floor(team1_scores || 0));

   // 修正後
   const team1ScoresStr = Array.isArray(team1_scores)
     ? JSON.stringify(team1_scores.map(score => Math.floor(score || 0)))
     : JSON.stringify([Math.floor(team1_scores || 0)]);
   ```

2. **読み取り処理の統一ヘルパー関数作成**
   ```typescript
   // lib/score-parser.ts（新規作成）
   export function parseScoreArray(score: string | number | null | undefined): number[] {
     if (!score) return [0];

     const scoreStr = String(score);

     // JSON配列形式
     if (scoreStr.startsWith('[')) {
       try {
         return JSON.parse(scoreStr);
       } catch {
         return [0];
       }
     }

     // カンマ区切り形式（レガシー対応）
     if (scoreStr.includes(',')) {
       return scoreStr.split(',').map(s => parseInt(s.trim()) || 0);
     }

     // 数値のみ形式（レガシー対応）
     return [parseInt(scoreStr) || 0];
   }

   export function parseTotalScore(score: string | number | null | undefined): number {
     const scores = parseScoreArray(score);
     return scores.reduce((sum, s) => sum + s, 0);
   }
   ```

3. **全ての読み取り箇所を新しいヘルパーに置き換え**
   - `app/api/matches/[id]/status/route.ts`
   - `app/api/matches/[id]/qr/route.ts`
   - `app/api/matches/[id]/confirm/route.ts`
   - `lib/match-results-calculator.ts`
   - その他20+箇所

##### Phase 2: 既存データの移行

**マイグレーションスクリプト作成**:
```javascript
// scripts/migrate-scores-to-json.mjs
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function migrateScores() {
  // t_matches_live
  const liveMatches = await db.execute(`
    SELECT match_id, team1_scores, team2_scores
    FROM t_matches_live
    WHERE team1_scores IS NOT NULL OR team2_scores IS NOT NULL
  `);

  for (const match of liveMatches.rows) {
    const team1 = convertToJson(match.team1_scores);
    const team2 = convertToJson(match.team2_scores);

    await db.execute(`
      UPDATE t_matches_live
      SET team1_scores = ?, team2_scores = ?
      WHERE match_id = ?
    `, [team1, team2, match.match_id]);
  }

  // t_matches_final
  const finalMatches = await db.execute(`
    SELECT match_id, team1_scores, team2_scores
    FROM t_matches_final
    WHERE team1_scores IS NOT NULL OR team2_scores IS NOT NULL
  `);

  for (const match of finalMatches.rows) {
    const team1 = convertToJson(match.team1_scores);
    const team2 = convertToJson(match.team2_scores);

    await db.execute(`
      UPDATE t_matches_final
      SET team1_scores = ?, team2_scores = ?
      WHERE match_id = ?
    `, [team1, team2, match.match_id]);
  }

  console.log('Migration completed!');
}

function convertToJson(score) {
  if (!score) return '[0]';

  const scoreStr = String(score);

  // すでにJSON形式
  if (scoreStr.startsWith('[')) {
    return scoreStr;
  }

  // カンマ区切り形式
  if (scoreStr.includes(',')) {
    const scores = scoreStr.split(',').map(s => parseInt(s.trim()) || 0);
    return JSON.stringify(scores);
  }

  // 数値のみ形式
  return JSON.stringify([parseInt(scoreStr) || 0]);
}

migrateScores();
```

##### Phase 3: レガシー対応削除（将来）
- マイグレーション完了後、1-2ヶ月経過を確認
- `parseScoreArray`関数内のレガシー対応（カンマ区切り、数値のみ）を削除
- JSON形式のみを想定したシンプルな実装に変更

---

## 📝 実装優先順位

### 🔴 高優先度（即座に実施）
1. ヘルパー関数 `lib/score-parser.ts` の作成
2. 新規データ保存処理の統一（`status/route.ts`）
3. 主要な読み取り箇所の修正（順位表計算、試合結果確定）

### 🟡 中優先度（1週間以内）
4. 全ての読み取り箇所の置き換え（20+箇所）
5. マイグレーションスクリプトの作成とテスト実行

### 🟢 低優先度（1ヶ月以内）
6. レガシー対応の削除
7. ドキュメント更新

---

## 🧪 テスト計画

### 1. ユニットテスト
```typescript
describe('parseScoreArray', () => {
  it('should parse JSON array format', () => {
    expect(parseScoreArray('[2,1]')).toEqual([2, 1]);
  });

  it('should parse comma-separated format (legacy)', () => {
    expect(parseScoreArray('2,1')).toEqual([2, 1]);
  });

  it('should parse single number format (legacy)', () => {
    expect(parseScoreArray('3')).toEqual([3]);
  });

  it('should handle null', () => {
    expect(parseScoreArray(null)).toEqual([0]);
  });
});
```

### 2. 統合テスト
- 審判UIでスコア入力 → DB保存 → 読み取り → 表示
- 順位表計算の正確性
- PDF生成の正確性

### 3. マイグレーションテスト
- 開発環境でマイグレーション実行
- 全データの変換確認
- 順位表の再計算と整合性チェック

---

## ⚠️ 注意事項

1. **本番環境でのマイグレーション前に必ずバックアップ取得**
2. **Phase 1完了後、新規データは全てJSON形式で統一される**
3. **既存データは当面、レガシー形式のまま読み取り可能**
4. **順位表の再計算が必要になる可能性あり**

---

## 📚 参照

### 主要な関連ファイル

**保存処理**:
- `app/api/matches/[id]/status/route.ts` (カンマ区切り)
- `app/api/matches/[id]/scores-extended/route.ts` (JSON)
- `app/api/matches/[id]/confirm/route.ts` (確定時コピー)

**読み取り処理**:
- `lib/match-results-calculator.ts` (順位表計算コア)
- `lib/standings-calculator.ts` (順位表計算)
- `app/admin/tournaments/[id]/matches/page.tsx` (管理画面表示)

**審判UI**:
- `app/referee/match/[id]/page.tsx` (スコア入力)
- `components/features/referee/SoccerRefereeInterface.tsx` (サッカー用UI)

---

**次のステップ**: Phase 1の実装を開始し、ヘルパー関数と保存処理の統一を行うことを推奨します。
