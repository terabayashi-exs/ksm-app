# 🎯 2位リーグ順位表が全て0になる問題の修正完了

## 📋 問題の概要

**症状**: ID:73の大会で2位リーグ（決勝フェーズ）の試合を確定させても、大会詳細画面の順位表で勝点・試合数・得失点差等が全て0と表示される。

**発生箇所**: 大会ID 73、ブロックID 356 (2位リーグ)

## 🔍 根本原因

### 1. データベースの状態
- 決勝フェーズ（1位リーグ、2位リーグ、3位リーグ）の試合データは正常に存在
- 試合に参加しているチーム（マグマブリザード、スティールパンサーズなど6チーム）のデータも正常
- しかし、これらのチームの `t_tournament_teams.assigned_block` は予選ブロック（'A', 'B', 'C', etc.）のまま

### 2. コードの問題
`lib/standings-calculator.ts` の2つの関数が問題を引き起こしていました：

#### **calculateMultiSportBlockStandings() 関数** (サッカー等の多競技対応)
- **元のコード（1945-1956行目）**:
  ```typescript
  const teamsResult = await db.execute({
    sql: `
      SELECT DISTINCT tt.team_id, t.team_name, t.team_omission
      FROM t_tournament_teams tt
      INNER JOIN m_teams t ON tt.team_id = t.team_id
      WHERE tt.tournament_id = ? AND tt.assigned_block = (
        SELECT block_name FROM t_match_blocks WHERE match_block_id = ?
      )
      ORDER BY t.team_name
    `,
    args: [tournamentId, matchBlockId]
  });
  ```

- **問題点**:
  - WHERE句で `tt.assigned_block = '2位リーグ'` という条件を使用
  - しかし、決勝進出チームの`assigned_block`は予選ブロック（'A', 'B', etc.）のまま
  - 結果: `teamsResult.rows.length = 0` → 空配列が返される
  - 空配列が`team_rankings`に保存される → UI上で「全て0」と表示

#### **calculateBlockStandings() 関数** (PK等の非サッカー競技)
- 同様の問題が存在（498-525行目）

## ✅ 修正内容

### 修正方針
**決勝フェーズのブロックでは、`assigned_block`に依存せず、試合データから直接チーム情報を取得する**

### 修正後のコード

両方の関数に以下の改善を適用：

```typescript
// ブロック情報を取得してphaseを確認
const blockInfoQuery = await db.execute({
  sql: `SELECT phase, block_name FROM t_match_blocks WHERE match_block_id = ?`,
  args: [matchBlockId]
});

const blockPhase = blockInfoQuery.rows[0]?.phase as string;
const blockName = blockInfoQuery.rows[0]?.block_name as string;

let teamsResult;

if (blockPhase === 'final') {
  // 🆕 決勝フェーズの場合は試合データから直接チーム情報を取得
  teamsResult = await db.execute({
    sql: `
      SELECT DISTINCT
        ml.team1_id as team_id,
        COALESCE(t.team_name, ml.team1_display_name) as team_name,
        t.team_omission
      FROM t_matches_live ml
      LEFT JOIN m_teams t ON ml.team1_id = t.team_id
      WHERE ml.match_block_id = ? AND ml.team1_id IS NOT NULL
      UNION
      SELECT DISTINCT
        ml.team2_id as team_id,
        COALESCE(t.team_name, ml.team2_display_name) as team_name,
        t.team_omission
      FROM t_matches_live ml
      LEFT JOIN m_teams t ON ml.team2_id = t.team_id
      WHERE ml.match_block_id = ? AND ml.team2_id IS NOT NULL
      ORDER BY team_name
    `,
    args: [matchBlockId, matchBlockId]
  });
} else {
  // ✅ 予選フェーズの場合は従来通り assigned_block を使用
  teamsResult = await db.execute({
    sql: `
      SELECT DISTINCT tt.team_id, t.team_name, t.team_omission
      FROM t_tournament_teams tt
      INNER JOIN m_teams t ON tt.team_id = t.team_id
      WHERE tt.tournament_id = ? AND tt.assigned_block = ?
      ORDER BY t.team_name
    `,
    args: [tournamentId, blockName]
  });
}
```

### 修正の利点
1. ✅ **決勝フェーズ対応**: `assigned_block`の更新なしで決勝リーグの順位表が正常に計算される
2. ✅ **予選フェーズ保護**: 予選ブロックは従来通りの動作を維持
3. ✅ **データ整合性**: 試合に実際に参加しているチームのみを取得
4. ✅ **汎用性**: 1位リーグ、2位リーグ、3位リーグ全てに対応

## 🧪 検証方法

### 方法1: テストスクリプトによる検証（推奨）
```bash
# チーム取得ロジックのテスト
node scripts/test-fixed-calculation.mjs

# 期待される出力:
# ✅ 成功: 6チームが正しく取得されました！
# チーム一覧:
#   1. スティールパンサーズ (ID: steelpan)
#   2. スーパーエクシーズ (ID: terabaya)
#   3. デビルクラッシャーズ (ID: devilcru)
#   4. マグマブリザード (ID: magmabli)
#   5. メガロマニアックス (ID: megaloma)
#   6. ライトニングジェッツ (ID: lightnin)
```

### 方法2: 実際の大会での確認
1. **開発サーバー起動**: `npm run dev`
2. **大会管理画面にアクセス**: http://localhost:3000/admin/tournaments/73/matches
3. **2位リーグの試合を確定**:
   - ②2: ライトニングジェッツ vs スーパーエクシーズ (例: 3-2)
4. **順位表を確認**: http://localhost:3000/public/tournaments/73
   - 決勝タブ → 2位リーグの順位表
   - **期待される結果**:
     - マグマブリザード: 3pts, 1W, 2GF, 1GA, +1GD
     - ライトニングジェッツ: 3pts, 1W, 3GF, 2GA, +1GD (②2で勝利した場合)
     - その他チーム: 0pts

## 📁 修正ファイル

- ✅ `lib/standings-calculator.ts` - 1944-1994行目 (calculateMultiSportBlockStandings)
- ✅ `lib/standings-calculator.ts` - 498-560行目 (calculateBlockStandings)

## 🔄 影響範囲

### ✅ 改善される機能
- 決勝フェーズ（1位リーグ、2位リーグ、3位リーグ等）の順位表計算
- サッカー以外の競技でも同様の問題が修正される

### 🔒 影響を受けない機能
- 予選フェーズの順位表計算（従来通りの動作）
- 試合結果の入力・確定処理
- トーナメント形式の大会

## 💡 今後の対応

### オプション: assigned_blockの更新
現在の修正により、`assigned_block`を更新しなくても動作するようになりましたが、
データ整合性の観点から、将来的に以下の対応を検討できます：

```typescript
// lib/tournament-promotion.ts に追加する例
async function updateAssignedBlockOnPromotion(
  tournamentId: number,
  teamId: string,
  newBlock: string
): Promise<void> {
  await db.execute(`
    UPDATE t_tournament_teams
    SET assigned_block = ?
    WHERE tournament_id = ? AND team_id = ?
  `, [newBlock, tournamentId, teamId]);
}
```

ただし、**現時点では不要**です。修正されたコードが既に正常に動作します。

## 📝 関連スクリプト

- `scripts/test-fixed-calculation.mjs` - チーム取得ロジックのテスト
- `scripts/test-2nd-league-calculation.mjs` - 手動順位計算テスト
- `scripts/debug-2nd-league-rankings.mjs` - team_rankings詳細確認
- `scripts/monitor-match-confirm.mjs` - リアルタイム監視（5秒間隔）

## ✨ 完了日時

2025年11月17日

---

**修正完了**: 次回の試合確定時から、2位リーグ（および他の決勝リーグ）の順位表が正常に計算されます。
