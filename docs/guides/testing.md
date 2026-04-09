# テスト方針ガイド

KSM-Appプロジェクトのテスト戦略と実施方法についてのガイドです。

## テストツール

| ツール | 用途 | コマンド |
|--------|------|---------|
| **Vitest** | ユニットテスト / 統合テスト | `npm run test` |
| **Playwright** | E2Eテスト（ブラウザ操作テスト） | `npx playwright test` |
| **Storybook** | UIコンポーネントの視覚テスト | `npm run storybook` |

## テスト構成

```
ksm-app/
├── vitest.config.ts          # Vitest設定
├── __tests__/                # テストファイル配置場所
│   └── **/*.test.ts(x)      # ユニット/統合テスト
├── .storybook/               # Storybook設定
└── stories/                  # Storybookストーリー
```

### Vitest設定 (`vitest.config.ts`)

2つのテストプロジェクトが定義されています:
- **unit**: `__tests__/**/*.test.ts(x)` — Node.js環境で実行
- **storybook**: Storybookコンポーネントのテスト — ブラウザ環境（Playwright）で実行

## テストの種類と使い分け

### 1. ユニットテスト（Vitest）

**対象**: 純粋な関数、ユーティリティ、計算ロジック

```typescript
// __tests__/lib/score-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseScoreArray, parseTotalScore, formatScoreArray } from '@/lib/score-parser';

describe('parseScoreArray', () => {
  it('JSON配列形式をパースできる', () => {
    expect(parseScoreArray('[3, 2, 1]')).toEqual([3, 2, 1]);
  });

  it('レガシー形式（カンマ区切り）をパースできる', () => {
    expect(parseScoreArray('3,2,1')).toEqual([3, 2, 1]);
  });

  it('nullの場合は空配列を返す', () => {
    expect(parseScoreArray(null)).toEqual([]);
  });
});

describe('parseTotalScore', () => {
  it('合計スコアを計算する', () => {
    expect(parseTotalScore('[3, 2, 1]')).toBe(6);
  });
});
```

**テスト対象として適切な関数**:
- `lib/score-parser.ts` — スコア解析
- `lib/tie-breaking-calculator.ts` — タイブレーク計算
- `lib/tournament-status.ts` — ステータス判定
- `lib/schedule-calculator.ts` — スケジュール計算
- `lib/player-name-normalizer.ts` — 選手名正規化
- その他の純粋関数

### 2. コンポーネントテスト（Storybook）

**対象**: UIコンポーネントの見た目と操作

```typescript
// stories/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@/components/ui/button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    children: 'ボタン',
    variant: 'default',
  },
};
```

### 3. E2Eテスト（Playwright）

**対象**: ユーザーの操作フロー全体

現時点ではPlaywrightは設定済みですが、E2Eテストの実装は今後の課題です。

## テストの実行

```bash
# 全テスト実行
npm run test

# ウォッチモード（ファイル変更で自動再実行）
npm run test:watch

# 特定ファイルのみ
npx vitest run __tests__/lib/score-parser.test.ts

# Storybook起動
npm run storybook
```

## テストデータの準備

### ユニットテストの場合

テスト用のデータはテストファイル内で直接定義します。DBへの接続は不要です。

```typescript
const mockMatch = {
  match_id: 1,
  team1_scores: '[3, 2]',
  team2_scores: '[1, 1]',
  period_count: 2,
};
```

### 手動テスト（開発中の確認）

開発中の動作確認は、以下の方法で行います:

1. **Drizzle Studio**: `npm run db:studio` でDBの中身を直接確認・編集
2. **ブラウザ**: `npm run dev` で開発サーバーを起動し、画面から操作
3. **curl / Postman**: APIを直接呼び出して動作確認

### マスターデータの初期化

テスト用の初期データを投入するには:

```bash
npm run db:seed-master
```

これにより会場・フォーマット・テンプレートの基本データが投入されます。

## テストを書くべきタイミング

| 状況 | テストの必要性 |
|------|--------------|
| 純粋な計算ロジックを追加した | ユニットテストを書く |
| 既存のロジックを変更した | 既存テストを確認し、必要なら更新 |
| バグを修正した | 再発防止のためテストを追加 |
| UIコンポーネントを追加した | Storybookストーリーを追加 |
| 単純なCRUD APIを追加した | 手動テストで十分 |

## 注意事項

- テストでDB接続が必要な場合は、dev環境のDBを使用（テスト専用DBは現時点で未設定）
- APIルートのテストは現時点では手動テスト中心。必要に応じてVitestで統合テストを追加
- CIでは `npm run build` と `npm run lint` と `npm run format:check` が自動実行される
