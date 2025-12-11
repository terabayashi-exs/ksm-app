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

### UI実装

#### **予選ブロックと同一レイアウト**
- **色分け表示**: 試合コード別色分け（T1-T4: 青、T5-T6: 紫、T7: 黄、T8: 赤）
- **試合状況表示**: 確定済み試合は結果表示、未確定は対戦カード表示
- **順位調整**: ドラッグ&ドロップまたは数値入力による順位変更

