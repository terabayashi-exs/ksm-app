# 決勝進出処理の検証・修正機能のバグ修正

## 問題概要

「順位表再計算」APIの決勝進出条件検証・自動修正機能が、`tournament_team_id`を考慮していないため、複数エントリーチーム対応が不完全。

## 修正が必要な箇所

### 1. `lib/tournament-promotion.ts` - `PromotionValidationIssue`インターフェース

**行番号**: 649-661

**現在のコード**:
```typescript
export interface PromotionValidationIssue {
  match_code: string;
  match_id: number;
  position: 'team1' | 'team2';
  expected_source: string;
  expected_team_id: string | null;
  expected_team_name: string | null;
  current_team_id: string | null;
  current_team_name: string | null;
  is_placeholder: boolean;
  severity: 'error' | 'warning';
  message: string;
}
```

**修正後**:
```typescript
export interface PromotionValidationIssue {
  match_code: string;
  match_id: number;
  position: 'team1' | 'team2';
  expected_source: string;
  expected_team_id: string | null;
  expected_tournament_team_id: number | null;  // ← 追加
  expected_team_name: string | null;
  current_team_id: string | null;
  current_tournament_team_id: number | null;   // ← 追加
  current_team_name: string | null;
  is_placeholder: boolean;
  severity: 'error' | 'warning';
  message: string;
}
```

---

### 2. `lib/tournament-promotion.ts` - `validateFinalTournamentPromotions`関数のクエリ

**行番号**: 704-727

**現在のコード**:
```typescript
const matchesResult = await db.execute({
  sql: `
    SELECT
      ml.match_id,
      ml.match_code,
      ml.team1_id,
      ml.team2_id,
      ml.team1_display_name,
      ml.team2_display_name,
      COALESCE(mo.team1_source_override, mt.team1_source) as team1_source,
      COALESCE(mo.team2_source_override, mt.team2_source) as team2_source,
      mt.team1_display_name as template_team1_display,
      mt.team2_display_name as template_team2_display,
      CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
    FROM t_matches_live ml
    ...
  `,
  args: [formatId, tournamentId, tournamentId]
});
```

**修正後**:
```typescript
const matchesResult = await db.execute({
  sql: `
    SELECT
      ml.match_id,
      ml.match_code,
      ml.team1_id,
      ml.team2_id,
      ml.team1_tournament_team_id,              -- ← 追加
      ml.team2_tournament_team_id,              -- ← 追加
      ml.team1_display_name,
      ml.team2_display_name,
      COALESCE(mo.team1_source_override, mt.team1_source) as team1_source,
      COALESCE(mo.team2_source_override, mt.team2_source) as team2_source,
      mt.team1_display_name as template_team1_display,
      mt.team2_display_name as template_team2_display,
      CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
    FROM t_matches_live ml
    ...
  `,
  args: [formatId, tournamentId, tournamentId]
});
```

---

### 3. `lib/tournament-promotion.ts` - `validateFinalTournamentPromotions`関数の比較ロジック

**行番号**: 732-776（team1）、778-809（team2）

**現在のコード（team1の例）**:
```typescript
for (const match of matchesResult.rows) {
  const matchId = match.match_id as number;
  const matchCode = match.match_code as string;
  const team1Id = match.team1_id as string | null;
  const team2Id = match.team2_id as string | null;
  const team1DisplayName = match.team1_display_name as string;
  const team2DisplayName = match.team2_display_name as string;
  // ...

  if (team1Source && team1Source.match(/^[A-Z]_\d+$/)) {
    const expectedTeam = promotions[team1Source];

    if (expectedTeam) {
      if (team1Id !== expectedTeam.team_id) {  // ← team_idのみ比較
        // ... issue追加
      }
    }
  }
}
```

**修正後**:
```typescript
for (const match of matchesResult.rows) {
  const matchId = match.match_id as number;
  const matchCode = match.match_code as string;
  const team1Id = match.team1_id as string | null;
  const team2Id = match.team2_id as string | null;
  const team1TournamentTeamId = match.team1_tournament_team_id as number | null;  // ← 追加
  const team2TournamentTeamId = match.team2_tournament_team_id as number | null;  // ← 追加
  const team1DisplayName = match.team1_display_name as string;
  const team2DisplayName = match.team2_display_name as string;
  // ...

  if (team1Source && team1Source.match(/^[A-Z]_\d+$/)) {
    const expectedTeam = promotions[team1Source];

    if (expectedTeam) {
      // tournament_team_idを優先的に比較、なければteam_idで比較
      const isMismatch = expectedTeam.tournament_team_id
        ? team1TournamentTeamId !== expectedTeam.tournament_team_id
        : team1Id !== expectedTeam.team_id;

      if (isMismatch) {  // ← 修正
        const isPlaceholder = team1DisplayName === templateTeam1Display;

        issues.push({
          match_code: matchCode,
          match_id: matchId,
          position: 'team1',
          expected_source: team1Source,
          expected_team_id: expectedTeam.team_id,
          expected_tournament_team_id: expectedTeam.tournament_team_id || null,  // ← 追加
          expected_team_name: expectedTeam.team_name,
          current_team_id: team1Id,
          current_tournament_team_id: team1TournamentTeamId,  // ← 追加
          current_team_name: team1DisplayName,
          is_placeholder: isPlaceholder,
          severity: isConfirmed ? 'error' : 'warning',
          message: isPlaceholder
            ? `team1がプレースホルダー表記のまま: "${team1DisplayName}" → 正しくは "${expectedTeam.team_name}" (tt_id: ${expectedTeam.tournament_team_id})`
            : `team1が誤設定: "${team1DisplayName}" (tt_id: ${team1TournamentTeamId}) → 正しくは "${expectedTeam.team_name}" (tt_id: ${expectedTeam.tournament_team_id})`
        });

        console.log(`[PROMOTION_VALIDATION] ⚠️ ${matchCode} team1: "${team1DisplayName}" (tt_id: ${team1TournamentTeamId}) → 期待値 "${expectedTeam.team_name}" (tt_id: ${expectedTeam.tournament_team_id})`);
      }
    }
  }

  // team2も同様に修正
}
```

---

### 4. `lib/tournament-promotion.ts` - `autoFixPromotionIssues`関数のUPDATEクエリ

**行番号**: 865-886

**現在のコード**:
```typescript
for (const issue of issues) {
  try {
    const field = issue.position === 'team1' ? 'team1' : 'team2';

    await db.execute({
      sql: `
        UPDATE t_matches_live
        SET ${field}_id = ?, ${field}_display_name = ?, updated_at = datetime('now', '+9 hours')
        WHERE match_id = ?
      `,
      args: [issue.expected_team_id, issue.expected_team_name, issue.match_id]
    });

    console.log(`[PROMOTION_AUTO_FIX] ✅ ${issue.match_code} ${field}: "${issue.current_team_name}" → "${issue.expected_team_name}"`);
    fixedCount++;

  } catch (error) {
    // ...
  }
}
```

**修正後**:
```typescript
for (const issue of issues) {
  try {
    const field = issue.position === 'team1' ? 'team1' : 'team2';

    await db.execute({
      sql: `
        UPDATE t_matches_live
        SET ${field}_id = ?,
            ${field}_tournament_team_id = ?,     -- ← 追加
            ${field}_display_name = ?,
            updated_at = datetime('now', '+9 hours')
        WHERE match_id = ?
      `,
      args: [
        issue.expected_team_id,
        issue.expected_tournament_team_id,       -- ← 追加
        issue.expected_team_name,
        issue.match_id
      ]
    });

    console.log(`[PROMOTION_AUTO_FIX] ✅ ${issue.match_code} ${field}: "${issue.current_team_name}" (tt_id: ${issue.current_tournament_team_id}) → "${issue.expected_team_name}" (tt_id: ${issue.expected_tournament_team_id})`);
    fixedCount++;

  } catch (error) {
    // ...
  }
}
```

---

## テスト方法

1. 部門ID:84のデータを意図的に不正な状態に戻す
2. 「順位表再計算」ボタンを押下
3. 自動修正が実行され、`tournament_team_id`も含めて正しく修正されることを確認

## 影響範囲

- 複数エントリーチームが存在する大会での決勝進出処理
- 「順位表再計算」APIの検証・自動修正機能
- すでに正しいデータの大会には影響なし
