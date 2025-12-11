# 試合速報エリアシステム

[← 実装済み機能一覧に戻る](./implemented-features.md)

## 📺 試合速報エリアシステム

### 基本概念

大会の日程・結果ページ上部に表示される、現在進行中の試合や最近完了した試合をリアルタイムで表示するシステムです。30秒間隔で自動更新され、観戦者や運営者が最新の試合状況を即座に把握できます。

### 実装仕様

#### **1. 表示対象試合の判定ルール**

| 試合状態 | 表示条件 | 表示時間 | 色分け | 説明 |
|----------|----------|----------|--------|------|
| `ongoing` | 常時表示 | 無制限 | 🔴 赤色 | 現在進行中の試合 |
| `completed` | `updated_at`が30分以内 | 30分間 | 🟣 紫色 / 🔵 青色 | 結果待ち / 確定済み |

#### **2. 色分けシステム**
```typescript
const getMatchStyle = (match: MatchNewsData) => {
  if (match.match_status === 'ongoing') {
    return {
      container: 'border-l-4 border-red-500 bg-gradient-to-r from-red-50 to-red-100',
      badge: 'bg-red-500 text-white animate-pulse',
      icon: <Zap className="h-4 w-4 text-red-600" />,
      label: 'LIVE'
    };
  } else if (match.has_result) {
    return {
      container: 'border-l-4 border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100',
      badge: 'bg-blue-500 text-white',
      icon: <CheckCircle className="h-4 w-4 text-blue-600" />,
      label: '終了'
    };
  } else if (match.match_status === 'completed') {
    return {
      container: 'border-l-4 border-purple-500 bg-gradient-to-r from-purple-50 to-purple-100',
      badge: 'bg-purple-500 text-white',
      icon: <AlertTriangle className="h-4 w-4 text-purple-600" />,
      label: '結果待ち'
    };
  }
};
```

#### **3. リアルタイム更新機能**
```typescript
useEffect(() => {
  const fetchNewsMatches = async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/match-news`);
    // 30秒ごとに更新
  };
  
  fetchNewsMatches();
  const interval = setInterval(fetchNewsMatches, 30000);
  return () => clearInterval(interval);
}, [tournamentId]);
```

#### **4. 優先度表示システム**
```typescript
// 表示優先度（最大6件）
const sortedMatches = newsMatches
  .map(match => ({ ...match, style: getMatchStyle(match) }))
  .sort((a, b) => {
    // 1. 進行中 → 2. 終了 → 3. 結果待ち の順
    if (a.style.priority !== b.style.priority) {
      return a.style.priority - b.style.priority;
    }
    // 同じ優先度内では更新時刻の新しい順
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  })
  .slice(0, 6);
```

### 主要ファイル

#### **UIコンポーネント**
- **`components/features/tournament/MatchNewsArea.tsx`**: メインコンポーネント
- **`components/features/tournament/TournamentSchedule.tsx`**: 統合表示

#### **APIエンドポイント**
- **`app/api/tournaments/[id]/match-news/route.ts`**: 速報データ取得API

#### **データ取得クエリ**
```sql
SELECT 
  ml.match_id,
  ml.match_code,
  COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
  COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
  ml.court_number,
  ml.start_time,
  ml.match_status,
  ml.updated_at,
  CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as has_result
FROM t_matches_live ml
LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
WHERE mb.tournament_id = ?
  AND (
    ml.match_status = 'ongoing'
    OR (ml.match_status = 'completed' AND ml.updated_at >= ?)
  )
ORDER BY 
  CASE ml.match_status 
    WHEN 'ongoing' THEN 1
    WHEN 'completed' THEN 2
    ELSE 3
  END,
  ml.updated_at DESC
LIMIT 6
```

### 表示項目

#### **試合情報**
- **試合コード**: A1, B2, T8（決勝）など
- **対戦カード**: 正式チーム名で表示
- **コート番号**: 使用コート表示
- **時間情報**: 開始時刻または経過時間

#### **状態表示**
- **進行中**: アニメーション付きLIVEバッジ
- **結果待ち**: 紫色の「結果待ち」バッジ
- **確定済み**: 青色の「終了」バッジ

#### **勝者強調**
```typescript
const getWinnerDisplay = (match: MatchNewsData) => {
  const winnerIsTeam1 = match.winner_team_id === match.team1_id;
  return {
    team1Style: winnerIsTeam1 ? 'text-green-700 font-bold' : 'text-gray-600',
    team2Style: winnerIsTeam1 ? 'text-gray-600' : 'text-green-700 font-bold'
  };
};
```

### 時間管理

#### **JST時刻基準**
```typescript
const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
const thirtyMinutesAgoJST = new Date(thirtyMinutesAgo.getTime() + 9 * 60 * 60 * 1000)
  .toISOString().replace('T', ' ').substring(0, 19);
```

#### **時間表示ロジック**
```typescript
const getTimeDisplay = (match: MatchNewsData): string => {
  if (match.match_status === 'ongoing') {
    return match.start_time ? match.start_time.substring(0, 5) : '--:--';
  }
  
  // 終了時刻からの経過時間表示
  const endTime = new Date(match.end_time);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - endTime.getTime()) / (1000 * 60));
  
  if (diffMinutes < 60) {
    return `${diffMinutes}分前終了`;
  }
  
  return match.end_time.substring(0, 5) + ' 終了';
};
```

### 運用上の利点

1. **即座の状況把握**: 現在の試合状況をページトップで確認
2. **自動更新**: 手動更新不要のリアルタイム情報
3. **視覚的判別**: 色分けとアイコンによる直感的な状態理解
4. **効率的表示**: 最大6件の適切な情報量
5. **時間管理**: 30分制限による適切な情報整理
6. **チーム名表示**: 略称ではなく正式名称での分かりやすい表示

### 技術的特徴

- **パフォーマンス**: SQLクエリの最適化とデータ量制限
- **レスポンシブ**: モバイル対応済みのUI設計
- **エラーハンドリング**: ネットワークエラーやデータ不整合への対応
- **キャッシュ制御**: `cache: 'no-store'`による最新データ取得
- **メモリ効率**: 定期的なInterval clearによるメモリリーク防止

