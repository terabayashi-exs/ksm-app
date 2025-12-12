# スコアパーサーシステム

## 概要

スコアデータの読み書きを統一的に扱うヘルパー関数群です。JSON配列形式を標準とし、レガシー形式（カンマ区切り、単一数値）からの後方互換性も提供します。

## 実装ファイル

`lib/score-parser.ts`

## 提供機能

### 1. parseScoreArray()

スコアデータを数値配列にパースします。

**シグネチャ**:
```typescript
function parseScoreArray(
  score: string | number | bigint | ArrayBuffer | null | undefined
): number[]
```

**対応形式**:
- ✅ JSON配列: `"[3, 2, 1]"` → `[3, 2, 1]`
- ✅ カンマ区切り（レガシー）: `"3,2,1"` → `[3, 2, 1]`
- ✅ 単一数値（レガシー）: `"5"` → `[5]`
- ✅ 数値型: `5` → `[5]`
- ✅ ArrayBuffer型: デコード後にパース

**使用例**:
```typescript
import { parseScoreArray } from '@/lib/score-parser';

// JSON配列形式
const scores1 = parseScoreArray("[3, 2, 1]");  // [3, 2, 1]

// レガシー形式（カンマ区切り）
const scores2 = parseScoreArray("3,2,1");      // [3, 2, 1]

// 単一数値
const scores3 = parseScoreArray("5");          // [5]

// null/undefined
const scores4 = parseScoreArray(null);         // [0]
```

### 2. parseTotalScore()

スコアデータの合計値を取得します。

**シグネチャ**:
```typescript
function parseTotalScore(
  score: string | number | bigint | ArrayBuffer | null | undefined
): number
```

**使用例**:
```typescript
import { parseTotalScore } from '@/lib/score-parser';

const total1 = parseTotalScore("[3, 2, 1]");  // 6
const total2 = parseTotalScore("3,2,1");      // 6
const total3 = parseTotalScore("5");          // 5
```

### 3. formatScoreArray()

数値配列をJSON形式の文字列に変換します。

**シグネチャ**:
```typescript
function formatScoreArray(
  scores: number[] | number | null | undefined
): string
```

**使用例**:
```typescript
import { formatScoreArray } from '@/lib/score-parser';

const formatted1 = formatScoreArray([3, 2, 1]);  // "[3,2,1]"
const formatted2 = formatScoreArray(5);          // "[5]"
const formatted3 = formatScoreArray(null);       // "[0]"
```

### 4. isValidScore()

スコアデータの妥当性を検証します。

**シグネチャ**:
```typescript
function isValidScore(score: any): boolean
```

### 5. formatScoreDisplay()

スコア配列を表示用文字列に変換します。

**シグネチャ**:
```typescript
function formatScoreDisplay(scores: number[]): string
```

**使用例**:
```typescript
import { formatScoreDisplay } from '@/lib/score-parser';

const display = formatScoreDisplay([3, 2, 1]);  // "3-2-1"
```

## 使用箇所

### データ書き込み（保存）

以下のAPIエンドポイントで使用:
- `app/api/matches/[id]/status/route.ts` - 試合スコア更新
- `app/api/matches/[id]/scores-extended/route.ts` - 拡張スコア更新

### データ読み取り（表示）

以下のファイルで使用:
- `app/api/tournaments/[id]/public-matches/route.ts` - 日程・結果API
- `app/api/tournaments/[id]/bracket/route.ts` - トーナメント表API
- `app/api/matches/[id]/confirm/route.ts` - 試合確定API
- `app/api/matches/[id]/qr/route.ts` - QR認証API
- `lib/standings-calculator.ts` - 順位表計算
- `lib/match-results-calculator.ts` - 試合結果計算
- `lib/tournament-blob-archiver.ts` - アーカイブ処理
- `app/admin/tournaments/[id]/matches/page.tsx` - 管理画面試合一覧

## PK戦の特殊処理

サッカー等の競技でPK戦がある場合、通常時間とPK戦のスコアは独立して扱われます。

### データ構造

```typescript
// サッカー: 前半1点、後半1点、延長0点、PK戦5点
const scores = [1, 1, 0, 5];
```

### 処理例（日程・結果ページ）

`app/api/tournaments/[id]/public-matches/route.ts` の `calculateDisplayScore` 関数:

```typescript
const scores = parseScoreArray(scoreData);

if (sportConfig?.supports_pk && scores.length >= 5) {
  // 通常時間（最初の4ピリオド）
  const regularTotal = scores.slice(0, 4).reduce((sum, score) => sum + score, 0);

  // PK戦（5ピリオド目以降）
  const pkTotal = scores.slice(4).reduce((sum, score) => sum + score, 0);

  return {
    goals: regularTotal,      // 通常時間の合計
    pkGoals: pkTotal,          // PK戦の合計
    scoreDisplay: null
  };
}
```

### 処理例（戦績表）

`lib/standings-calculator.ts` の `analyzeScore` 関数:

```typescript
const periods = parseScoreArray(scoreStr);

if (currentSportCode === 'soccer' && periodCount >= 4) {
  // PK戦あり（前半・後半・延長・PK）
  const regularScore = periods.slice(0, -1).reduce((sum, p) => sum + p, 0);
  const pkScore = periods[periods.length - 1];

  return {
    regularTime: regularScore,     // 順位表に使用
    pkScore: pkScore,              // 表示のみ
    forStandings: regularScore     // 順位計算には通常時間のみ
  };
}
```

## 移行履歴

### 2025-12-12: スコアフォーマット統一

**背景**:
- 混在していたデータ形式（JSON配列、カンマ区切り、単一数値）
- `.split(',')` や `.includes(',')` の直接使用による保守性の問題

**実施内容**:
1. ヘルパー関数の実装（`lib/score-parser.ts`）
2. 全データベースレコードのJSON配列形式への移行（287レコード）
3. 全API・コンポーネントでのヘルパー関数適用

**修正ファイル**:
- `lib/score-parser.ts` - 新規作成
- `app/api/matches/[id]/status/route.ts` - 保存・読み取り処理
- `app/api/tournaments/[id]/public-matches/route.ts` - calculateDisplayScore修正
- `app/api/tournaments/[id]/bracket/route.ts` - スコア配列パース修正
- `app/api/matches/[id]/confirm/route.ts` - parseTotalScore使用
- `app/api/matches/[id]/qr/route.ts` - parseScoreArray使用
- `lib/standings-calculator.ts` - parseScore/analyzeScore修正
- `lib/match-results-calculator.ts` - parseScore修正
- `lib/tournament-blob-archiver.ts` - parseTotalScore使用
- `app/admin/tournaments/[id]/matches/page.tsx` - 複数箇所修正

**移行スクリプト**:
- `scripts/migrate-scores-to-json.mjs` - データ移行スクリプト

**検証**:
- ✅ 全287レコードがJSON配列形式に統一
- ✅ PK戦の特殊処理は全て正常動作
- ✅ 日程・結果、トーナメント表、戦績表で正しく表示
- ✅ ビルド成功・型チェック通過

## ベストプラクティス

### ✅ 推奨

```typescript
// 保存時
import { formatScoreArray } from '@/lib/score-parser';
const scoreData = formatScoreArray([3, 2, 1]);

// 読み取り時（配列が必要）
import { parseScoreArray } from '@/lib/score-parser';
const scores = parseScoreArray(scoreData);

// 読み取り時（合計のみ必要）
import { parseTotalScore } from '@/lib/score-parser';
const total = parseTotalScore(scoreData);
```

### ❌ 非推奨

```typescript
// ❌ split(',')の直接使用
const scores = scoreData.split(',').map(s => parseInt(s));

// ❌ includes(',')の直接使用
if (scoreData.includes(',')) {
  // ...
}

// ❌ parseInt()の直接使用
const total = parseInt(scoreData);
```

## まとめ

スコアパーサーシステムにより、以下が実現されました：

1. **データ品質の向上**: 全スコアデータがJSON配列形式で統一
2. **保守性の向上**: 一元化されたヘルパー関数による管理
3. **後方互換性**: レガシー形式からの読み取り対応
4. **PK戦対応**: 特殊処理の互換性維持

将来的には、レガシー形式の読み取り対応を段階的に削除し、完全にJSON配列形式のみに移行することが可能です。
