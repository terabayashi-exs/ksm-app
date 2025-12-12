# 辞退管理システム（詳細仕様）

[← 実装済み機能一覧に戻る](./implemented-features.md)

## 🚫 辞退管理システム（詳細仕様）

### 完全実装された辞退処理ワークフロー

#### **1. 辞退申請（チーム側）**
```typescript
// components/features/tournament/WithdrawalForm.tsx
interface WithdrawalRequest {
  tournament_team_id: number;
  withdrawal_reason: string;
  impact_acknowledgment: boolean;
}
```

#### **2. 影響度分析エンジン**
```typescript
// 自動計算される影響度評価
interface WithdrawalImpact {
  overallImpact: 'low' | 'medium' | 'high';
  scheduledMatches: number;      // 今後の予定試合数
  completedMatches: number;      // 完了済み試合数
  affectedTeams: number;         // 影響を受ける他チーム数
  tournamentPhase: string;       // 現在の大会フェーズ
  recommendedAction: string;     // システム推奨処理
}
```

#### **3. 管理者承認・却下システム**
```typescript
// components/features/admin/WithdrawalRequestManagement.tsx
- 申請一覧表示（フィルタリング・ソート機能）
- 影響度バッジによる視覚的優先度表示
- 一括処理機能（複数申請の同時処理）
- 統計ダッシュボード（期間別・大会別分析）
```

#### **4. データベース設計**
```sql
-- t_tournament_teams テーブル拡張
withdrawal_status TEXT DEFAULT 'active'           -- ステータス管理
withdrawal_reason TEXT                             -- 辞退理由
withdrawal_requested_at DATETIME                   -- 申請日時
withdrawal_processed_at DATETIME                   -- 処理完了日時
withdrawal_processed_by TEXT                       -- 処理担当者
withdrawal_admin_comment TEXT                      -- 管理者コメント
```

### API エンドポイント

#### **チーム向け**
- `POST /api/tournaments/[id]/withdrawal`: 辞退申請提出
- `GET /api/teams/tournaments`: 辞退状況を含む参加大会一覧

#### **管理者向け**
- `GET /api/admin/withdrawal-requests`: 申請一覧（フィルタリング対応）
- `POST /api/admin/withdrawal-requests/[id]/process`: 個別処理
- `POST /api/admin/withdrawal-requests/bulk-process`: 一括処理
- `GET /api/admin/withdrawal-requests/[id]/impact`: 影響度分析
- `GET /api/admin/withdrawal-statistics`: 辞退統計データ

### 統計・分析機能

#### **ダッシュボード表示項目**
- 申請数推移（日別・週別・月別）
- 大会別辞退率
- 辞退理由分析（カテゴリ別）
- 影響度分布
- 処理時間分析
- 承認・却下率

