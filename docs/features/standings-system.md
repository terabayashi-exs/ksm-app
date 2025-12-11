# 順位表システムの実装仕様

[← 実装済み機能一覧に戻る](./implemented-features.md)

## 🏆 順位表システムの実装仕様

### 基本概念

順位表システムは以下の考え方で実装されています：

1. **リアルタイム計算から事前計算への変更**
   - 順位表は表示時にリアルタイム計算するのではなく、試合結果確定時に事前計算して保存
   - 計算結果は`t_match_blocks.team_rankings`にJSON形式で保存
   - 表示時は保存されたデータを読み込むだけなので高速

2. **管理者による順位調整機能**
   - 自動計算された順位を管理者が手動で調整可能
   - 同着順位の設定（例：1位、2位、4位、4位、8位、8位、8位、8位）
   - 3位決定戦がない場合などの柔軟な順位付けに対応

### データフロー

```
試合結果入力 → t_matches_live
     ↓
管理者が結果確定 → POST /api/matches/confirm
     ↓
t_matches_live → t_matches_final（移行）
     ↓
順位自動計算 → t_match_blocks.team_rankings（JSON保存）
     ↓
順位表表示 → GET /api/tournaments/[id]/standings
```

### 主要な関数とAPI

#### **順位計算・管理（lib/standings-calculator.ts）**
- `getTournamentStandings(tournamentId)`: team_rankingsから順位表取得
- `updateBlockRankingsOnMatchConfirm(matchBlockId, tournamentId)`: ブロック順位表更新
- `recalculateAllTournamentRankings(tournamentId)`: 全ブロック再計算
- `calculateBlockStandings(matchBlockId, tournamentId)`: 特定ブロックの順位計算

#### **試合結果確定（lib/match-result-handler.ts）**
- `confirmMatchResult(matchId)`: 単一試合結果確定
- `confirmMultipleMatchResults(matchIds)`: 複数試合一括確定

#### **API エンドポイント**
- `GET /api/tournaments/[id]/standings`: 順位表取得
- `POST /api/tournaments/[id]/update-rankings`: 順位表更新
- `PUT /api/tournaments/[id]/manual-rankings`: 手動順位編集
- `POST /api/matches/confirm`: 試合結果確定

### 順位決定ルール

自動計算時の順位決定基準（優先順）：
1. **勝点**（勝利: 3点、引分: 1点、敗北: 0点）
2. **総得点数**（多い順）
3. **得失点差**（良い順）
4. **直接対決の結果**（勝点 → 得失点差）
5. **抽選**（システム上はチーム名辞書順で代用）

### team_rankingsのJSON構造

```json
[
  {
    "team_id": "team_123",
    "team_name": "チーム名",
    "team_omission": "略称",
    "position": 1,
    "points": 9,
    "matches_played": 3,
    "wins": 3,
    "draws": 0,
    "losses": 0,
    "goals_for": 8,
    "goals_against": 2,
    "goal_difference": 6
  }
]
```

### 使用場面

1. **試合結果確定時**: 自動的に該当ブロックの順位表が更新される
2. **管理者による手動調整**: 同着順位や特殊ルールに対応
3. **一般ユーザー表示**: 高速な順位表表示
4. **大会終了後**: 最終順位として確定・保存

### 注意点

- `t_matches_live`は結果入力中・確定前のデータ
- `t_matches_final`は確定済みの結果データ
- 順位計算は`t_matches_final`のデータのみを使用
- 順位表の表示は`team_rankings`のデータのみを使用
- 管理者による手動調整は`team_rankings`を直接更新

