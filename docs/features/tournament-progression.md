# トーナメント進行システム

[← 実装済み機能一覧に戻る](./implemented-features.md)

## 🏁 トーナメント進行システム

### 基本概念

予選リーグ完了後、上位チームが自動的に決勝トーナメントに進出し、試合確定時にプレースホルダー（「T1の勝者」）が実際のチーム名に自動更新されるシステムです。

### 実装仕様

#### **1. 進出ルール動的検出**
```typescript
// lib/tournament-progression.ts
async function getTournamentProgressionRules(matchCode: string, tournamentId: number): Promise<ProgressionRule> {
  const winnerPattern = `${matchCode}_winner`;
  const dependentMatchesResult = await db.execute(`
    SELECT match_code, team1_source, team2_source
    FROM m_match_templates
    WHERE format_id = ? AND (team1_source = ? OR team2_source = ?)
  `, [formatId, winnerPattern, winnerPattern]);
  return rule;
}
```

#### **2. 自動チーム名更新**
```typescript
// 試合確定時の処理フロー
試合結果確定 → updateTournamentProgression() → 依存試合のチーム名更新
```

#### **3. 主要機能**
- **動的ルール検出**: `m_match_templates`からの進出条件自動取得
- **依存関係解決**: T1_winner → 実際の勝利チーム名に更新
- **予選上位進出**: ブロック1位・2位の自動決勝トーナメント進出
- **エラーハンドリング**: 未確定試合・存在しないチームIDの適切な処理

### データフロー

```
1. 予選リーグ試合確定
    ↓
2. ブロック順位表更新
    ↓
3. 上位2チーム確定時の進出処理
    ↓
4. 決勝トーナメント試合のteam_id更新
    ↓
5. 依存試合のdisplay_name更新
```

### 技術的実装

#### **進出チーム特定**
```typescript
// 各ブロック上位2チームを特定
const topTeams = await promoteTeamsToFinalTournament(tournamentId);
```

#### **依存試合更新**
```typescript
// T1_winnerパターンの試合を特定し、実際のチーム名に更新
const dependentMatches = await findDependentMatches(matchCode, tournamentId);
await updateDependentMatches(dependentMatches, winnerTeamId);
```

