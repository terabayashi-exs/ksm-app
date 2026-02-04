# 手動順位設定システム（拡張版）

[← 実装済み機能一覧に戻る](./implemented-features.md)

## 📈 手動順位設定システム（拡張版）

### 基本概念

予選ブロックに加えて、決勝トーナメントの順位も手動で調整できる包括的な順位管理システムです。

### 決勝トーナメント対応

#### **1. 決勝試合情報取得**
```sql
SELECT 
  ml.match_code, ml.team1_id, ml.team2_id,
  COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
  COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
  mf.winner_team_id, mf.is_confirmed
FROM t_matches_live ml
LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
WHERE phase = 'final'
```

#### **2. 順位計算ロジック**
```typescript
// 決勝試合分類
const finalMatch = matches.find(m => m.match_code === 'T8');      // 決勝
const thirdPlaceMatch = matches.find(m => m.match_code === 'T7'); // 3位決定戦
const semiFinalMatches = matches.filter(m => ['T5', 'T6']);       // 準決勝
const quarterFinalMatches = matches.filter(m => ['T1', 'T2', 'T3', 'T4']); // 準々決勝
```

#### **3. 手動調整機能**
- **順位入力**: 各チームの順位を個別に設定可能
- **同着対応**: 複数チームに同じ順位を設定可能
- **備考記録**: 順位決定理由の記録

#### **4. 保存処理**
```typescript
// API: PUT /api/tournaments/[id]/manual-rankings
// 決勝トーナメント順位をt_match_blocks.team_rankingsに保存
interface FinalTournamentUpdate {
  block_name: '決勝トーナメント';
  team_rankings: FinalRanking[];
  remarks: string;
}
```

### 「要調整」タグの動的表示（2026年2月実装）

#### **概要**
決勝進出に影響する順位での同着発生時のみ「要調整」タグを表示する機能。

#### **実装の特徴**

1. **形式別の自動判定**
   - **トーナメント形式**: 「要調整」タグを表示しない（順位は試合結果から自動決定）
   - **リーグ形式**: 決勝進出に影響する順位のみチェック

2. **決勝進出条件の動的取得**
   ```typescript
   // m_match_templatesとt_tournament_match_overridesから取得
   const promotionRequirements = [
     "A_1", "A_2", "B_1", "B_2", // 例: 各ブロック1位・2位が進出
     "C_3"  // オーバーライド: Cブロック3位も進出（辞退対応など）
   ];
   ```

3. **同着チェックロジック**
   ```typescript
   // ブロック名（A, B, Cなど）を抽出
   const blockPrefix = "A";
   const requiredPositions = [1, 2]; // A_1, A_2から抽出

   // 必要順位内でのみ同着をチェック
   const needsAdjustment = teams
     .filter(t => requiredPositions.includes(t.position))
     .some(t => hasDuplicate(t.position));
   ```

4. **表示条件**
   - ✅ リーグ形式 かつ 必要順位で同着 → 「要調整」表示
   - ❌ トーナメント形式 → 表示しない
   - ❌ 不要順位での同着（例: 4位同着で3位まで進出） → 表示しない

#### **影響範囲**

| 画面 | コンポーネント | 動作 |
|------|--------------|------|
| 手動順位設定 | `ManualRankingsEditor.tsx` | 黄色のカード枠＋パルス表示 |
| 試合結果入力 | `NotificationBanner.tsx` | 警告バナー表示 |
| 管理ダッシュボード | `TournamentDashboardList.tsx` | 赤いバッジ表示 |

#### **通知生成ロジック（lib/standings-calculator.ts）**

```typescript
// 1. 必要順位の取得
async function getRequiredPromotionPositions(
  tournamentId: number,
  blockName: string
): Promise<number[]> {
  // format_idを取得 → preliminary_format_typeをチェック
  // tournament形式なら空配列を返す（通知不要）
  // league形式ならm_match_templatesから決勝進出条件を抽出
}

// 2. 同着分析
async function analyzePromotionEligibility(
  standings: TeamStanding[],
  tournamentId: number,
  blockName: string
): Promise<{
  canPromote: boolean;
  tiedPositions: Map<number, TeamStanding[]>;
  tieMessage: string | null;
  requiredPositions: number[];
}>

// 3. 通知作成
async function createTieNotificationIfNeeded(
  tournamentId: number,
  blockId: number,
  blockName: string,
  promotionStatus: PromotionStatus
): Promise<void>
```

#### **オーバーライド対応**

`t_tournament_match_overrides`テーブルで決勝進出条件を変更可能：

```sql
-- 例: チーム辞退によりA_3をB_4に変更
INSERT INTO t_tournament_match_overrides (
  tournament_id, match_code,
  team1_source_override, -- "B_4" に変更
  override_reason
) VALUES (128, 'T1', 'B_4', 'Aブロック3位チーム辞退のため');
```

### UI実装

#### **予選ブロックと同一レイアウト**
- **色分け表示**: 試合コード別色分け（T1-T4: 青、T5-T6: 紫、T7: 黄、T8: 赤）
- **試合状況表示**: 確定済み試合は結果表示、未確定は対戦カード表示
- **順位調整**: ドラッグ&ドロップまたは数値入力による順位変更
- **形式別表示**: トーナメント形式では戦績情報（ポイント、勝敗、得失点差）を非表示

