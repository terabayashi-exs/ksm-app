# 大会エントリー辞退機能

[← 実装済み機能一覧に戻る](./implemented-features.md)

## 🚫 大会エントリー辞退機能

### 基本概念

参加チームが大会へのエントリーを辞退し、管理者が辞退申請を承認・却下できる機能です。辞退処理により、試合スケジュールや順位表への影響を適切に管理し、大会運営の柔軟性を確保します。

### 実装仕様

#### **辞退ステータス管理**
`t_tournament_teams`テーブルの`withdrawal_status`フィールドで辞退状態を管理：

| ステータス | 値 | 説明 |
|------------|----|----|
| **参加中** | `active` | 通常の参加状態（デフォルト） |
| **辞退申請中** | `withdrawal_requested` | チームが辞退を申請した状態 |
| **辞退承認済み** | `withdrawal_approved` | 管理者が辞退を承認した状態 |
| **辞退却下** | `withdrawal_rejected` | 管理者が辞退を却下した状態 |

#### **辞退データ構造**
```sql
-- t_tournament_teamsテーブルの辞退関連フィールド
withdrawal_status TEXT DEFAULT 'active'           -- 辞退ステータス
withdrawal_reason TEXT                             -- 辞退理由
withdrawal_requested_at DATETIME                   -- 辞退申請日時
withdrawal_processed_at DATETIME                   -- 辞退処理完了日時
withdrawal_processed_by TEXT                       -- 辞退処理者（管理者ID）
withdrawal_admin_comment TEXT                      -- 管理者コメント
```

### 主要機能

#### **1. チーム側辞退申請**
- **辞退フォーム**: 理由入力フォームによる辞退申請
- **申請確認**: 辞退理由と影響の確認画面
- **申請完了**: 管理者への通知と待機状態表示

#### **2. 管理者側辞退管理**
- **申請一覧**: 辞退申請の一元管理画面
- **影響度分析**: 試合・順位への影響度自動計算
- **承認・却下処理**: 理由付きでの処理決定
- **統計ダッシュボード**: 辞退状況の統計表示

#### **3. 辞退影響度評価システム**
```typescript
interface WithdrawalImpact {
  overallImpact: 'low' | 'medium' | 'high';
  scheduledMatches: number;      // 予定試合数
  completedMatches: number;      // 完了済み試合数
  affectedTeams: number;         // 影響を受けるチーム数
  tournamentPhase: string;       // 現在のフェーズ
  recommendedAction: string;     // 推奨処理
}
```

### 技術的実装

#### **API エンドポイント**
- `POST /api/tournaments/[id]/withdrawal`: 辞退申請提出
- `GET /api/admin/withdrawal-requests`: 辞退申請一覧取得
- `POST /api/admin/withdrawal-requests/[id]/process`: 辞退処理（承認・却下）
- `GET /api/admin/withdrawal-requests/[id]/impact`: 辞退影響度分析
- `POST /api/admin/withdrawal-requests/bulk-process`: 一括処理
- `GET /api/admin/withdrawal-statistics`: 辞退統計データ

#### **辞退処理フロー**
```
1. チーム辞退申請 → withdrawal_status = 'withdrawal_requested'
    ↓
2. 管理者による影響度分析 → 自動計算による推奨判定
    ↓
3. 管理者処理決定 → 'withdrawal_approved' or 'withdrawal_rejected'
    ↓
4. 承認時の後処理 → 試合スケジュール調整・通知送信
```

#### **データ整合性制約**
- 辞退申請時: `withdrawal_reason`と`withdrawal_requested_at`が必須
- 処理完了時: `withdrawal_processed_at`と`withdrawal_processed_by`が必須
- ステータス遷移: `active` → `withdrawal_requested` → `withdrawal_approved/withdrawal_rejected`のみ許可

### UI/UX設計

#### **チーム画面**
- **辞退ボタン**: 参加チーム一覧の各エントリーに表示
- **辞退理由入力**: テキストエリアによる理由記述
- **影響警告**: 辞退による大会への影響を事前表示
- **申請状況表示**: 申請中・処理済みの状態表示

#### **管理者画面**
- **辞退申請一覧**: フィルタリング・ソート機能付き
- **影響度バッジ**: 色分けによる影響度の視覚化
- **処理モーダル**: 承認・却下理由の入力UI
- **統計ダッシュボード**: 大会別・期間別の辞退統計

#### **通知システム**
- **申請時通知**: 管理者への辞退申請メール通知
- **処理完了通知**: チームへの処理結果メール通知
- **一括処理通知**: 複数申請の一括処理結果通知

### 運用上の利点

1. **柔軟な大会運営**: 予期しない辞退への適切な対応
2. **影響度の可視化**: 辞退による大会への影響を定量評価
3. **処理履歴の保持**: 辞退理由・処理内容の完全な記録
4. **効率的管理**: 一括処理による管理者の作業軽減
5. **統計分析**: 辞退傾向の分析による運営改善

### セキュリティ考慮事項

- **認証確認**: 辞退申請は該当チームのみ実行可能
- **管理者権限**: 辞退処理は管理者権限を持つユーザーのみ
- **操作ログ**: 全ての辞退関連操作をログ記録
- **データ保護**: 辞退理由等の機密情報の適切な管理

