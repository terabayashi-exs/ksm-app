# Claude Task Guide

## 🎯 プロジェクトの目的

「PK選手権大会」を運営するためのWebアプリケーションを構築します。  
主な用途は以下の通りです：

- 大会情報の登録（名称、日程、会場など）
- チームや選手の登録
- 試合スケジュールの作成（予選・決勝）
- 結果の入力と表示
- 一般ユーザー向けの結果公開ページ
- 管理者向けの結果公開ページ

## 🔧 使用技術

- フロントエンド: Next.js 14（App Router）
- バックエンド/API: Next.js（API Routes）
- デプロイ: Vercel
- データベース: Turso（SQLiteベース）
- 認証: NextAuth.js v5
- スタイリング: Tailwind CSS
- UI コンポーネント: shadcn/ui
- フォーム管理: React Hook Form + Zod
- 状態管理: Zustand（必要に応じて）

## 📊 データベース設計

データベース設計は`./docs/database/KSM.md`に詳細なER図（Mermaid記法）で定義されています。

主要テーブル構成：
- **マスタテーブル**: m_venues, m_teams, m_players, m_administrators, m_tournament_formats, m_match_templates
- **トランザクションテーブル**: t_tournaments, t_tournament_teams, t_match_blocks, t_matches_live, t_matches_final

詳細な設計については`./docs/database/KSM.md`を参照してください。

### Tursoでのトランザクション制限

Turso（リモートSQLite）を使用する際の重要な制限事項：

#### **制限内容**
- 従来のSQLiteトランザクション構文（`BEGIN TRANSACTION`, `COMMIT`, `ROLLBACK`）がサポートされていない
- リモートデータベースの性質上、トランザクション処理に制約がある

#### **対処法**
1. **トランザクションを使用しない設計**
   ```typescript
   // ❌ 動作しない (Tursoでエラーが発生)
   await db.execute('BEGIN TRANSACTION');
   // ... 処理 ...
   await db.execute('COMMIT');
   
   // ✅ 推奨される方法
   try {
     // 個別のUPDATE/INSERTを順次実行
     await db.execute('UPDATE ...');
     await db.execute('INSERT ...');
   } catch (error) {
     // エラーハンドリング
   }
   ```

2. **処理順序の工夫**
   - データ整合性を保つため、処理順序を慎重に設計
   - 削除→挿入/更新の順序でデータの不整合を最小化

3. **エラーハンドリング**
   - トランザクションによるロールバックができないため、エラー発生時の復旧処理を個別に実装
   - 部分的な処理失敗を想定した設計

#### **実装例（組合せ保存処理）**
```typescript
// app/api/tournaments/[id]/draw/route.ts
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // 1. 既存データをクリア
    await db.execute(`UPDATE t_tournament_teams SET assigned_block = NULL, block_position = NULL WHERE tournament_id = ?`, [tournamentId]);
    
    // 2. 新しいデータを保存
    for (const block of blocks) {
      for (const team of block.teams) {
        await db.execute(`UPDATE t_tournament_teams SET assigned_block = ?, block_position = ? WHERE tournament_id = ? AND team_id = ?`, [block.block_name, team.block_position, tournamentId, team.team_id]);
      }
    }
    
    // 3. 関連データの更新
    // ... 試合データ更新処理
    
    return NextResponse.json({ success: true });
  } catch (error) {
    // トランザクションロールバックは使用できないため、
    // エラー時の対処は個別に実装する必要がある
    throw error;
  }
}
```

#### **注意事項**
- 本番環境でもこの制限は適用される
- データベース設計時にトランザクション前提の処理を避ける
- 複雑な処理は複数のAPI呼び出しに分割することを検討する

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
2. **得失点差**
3. **総得点**
4. **チーム名**（辞書順）

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

## 📅 スケジュールプレビューシステム

### 概要

大会作成・編集時に、設定されたパラメータに基づいて試合スケジュールを自動計算・表示するシステムです。  
コート数、試合時間、休憩時間、開催日程などの運営設定を変更すると、リアルタイムでスケジュールが更新されます。

### 主要ファイル

- **`components/features/tournament/SchedulePreview.tsx`**: メインコンポーネント
- **`lib/schedule-calculator.ts`**: スケジュール計算エンジン

### 実装仕様

#### **1. 自動更新機能**

```typescript
// 設定変更の自動検出
const settingsChanged = 
  previousSettings.courtCount !== settings.courtCount ||
  previousSettings.matchDurationMinutes !== settings.matchDurationMinutes ||
  previousSettings.breakDurationMinutes !== settings.breakDurationMinutes ||
  previousSettings.startTime !== settings.startTime ||
  JSON.stringify(previousSettings.tournamentDates) !== JSON.stringify(settings.tournamentDates);

// 手動編集がない場合は自動更新
if (settingsChanged && !hasManualEdits) {
  setCustomSchedule(null); // リセットして再計算
}
```

#### **2. 手動編集保護機能**

- **手動編集フラグ**: ユーザーが試合時間を個別に変更した場合、`hasManualEdits`フラグが設定される
- **保護メカニズム**: 手動編集後は設定変更による自動更新を停止
- **リセット機能**: 「リセット」ボタンで手動編集を破棄し、最新設定でスケジュールを再計算

#### **3. execution_priority による試合依存関係制御**

##### **基本原理**
```typescript
// Priority間の完全分離
let groupStartTime = Math.max(...Object.values(courtEndTimes));

// 同一priority内での時間重複回避
matchStartTime = Math.max(groupStartTime, courtEndTimes[courtNumber]);
```

##### **制御ルール**
1. **同一priority内**: 同時進行可能（例：T1,T2,T3,T4が1回戦として並列実行）
2. **異なるpriority**: 前のpriorityの全試合完了後に開始（例：準決勝は1回戦完了後）
3. **コート制約**: 同じコートでの時間重複は自動回避

##### **動作例（コート数2、試合15分、休憩5分）**
```
Priority 7 (1回戦):
├─ T1 (コート1): 12:55-13:10
├─ T2 (コート2): 12:55-13:10
├─ T3 (コート1): 13:15-13:30 ← T1完了後
└─ T4 (コート2): 13:15-13:30 ← T2完了後

Priority 8 (準決勝):
├─ T5 (コート1): 13:35-13:50 ← 全Priority 7完了後
└─ T6 (コート2): 13:35-13:50
```

#### **4. コート管理システム**

##### **予選ブロック**
- **固定割り当て**: ブロック名（A,B,C,D）に基づくコート固定
- **時間管理**: ブロック毎に独立した時間管理

```typescript
// ブロック固定コート割り当て
blockToCourtMap[blockName] = (index % settings.courtCount) + 1;
matchStartTime = courtEndTimes[courtNumber];
```

##### **決勝トーナメント**
- **動的割り当て**: 利用可能コートを順番に使用
- **二重制約**: priority制御とコート制約の両方を適用

```typescript
// 決勝トーナメントのコート割り当て
courtNumber = ((i % settings.courtCount) + 1);
matchStartTime = Math.max(groupStartTime, courtEndTimes[courtNumber]);
```

#### **5. 時間重複チェック機能**

```typescript
function checkTimeConflictsForSchedule(days): TimeConflict[] {
  // チーム別に試合をグループ化
  // 同じチームの試合時間重複をチェック
  // 重複がある場合は詳細な警告メッセージを生成
}
```

#### **6. UI状態管理**

##### **表示モード**
- **新規作成モード**: テンプレートベースでスケジュール計算
- **編集モード**: 実際の試合データを表示・編集

##### **状態フラグ**
```typescript
const [hasManualEdits, setHasManualEdits] = useState(false);
const [previousSettings, setPreviousSettings] = useState(null);
const [customSchedule, setCustomSchedule] = useState(null);
```

##### **通知システム**
- **青色通知**: 手動編集中の状態表示
- **赤色警告**: 時間重複やコート不足のエラー

### 主要関数

#### **スケジュール計算**
```typescript
calculateTournamentSchedule(templates: MatchTemplate[], settings: ScheduleSettings): TournamentSchedule
```

#### **時間変更処理**
```typescript
handleTimeChange(dayIndex: number, matchIndex: number, newStartTime: string): void
```

#### **設定変更検出**
```typescript
useEffect(() => {
  // settings変更を検出してcustomScheduleをリセット
}, [settings, hasManualEdits]);
```

### 運用上の利点

1. **リアルタイム更新**: 設定変更が即座にスケジュールに反映
2. **柔軟な調整**: 個別試合時間の手動調整が可能
3. **制約遵守**: トーナメント依存関係とコート制約を自動考慮
4. **エラー防止**: 時間重複やコート不足を事前に警告
5. **効率性**: 最適なコート使用とスケジューリング

### 技術的考慮事項

- **計算複雑度**: O(n × m) （n=試合数, m=コート数）
- **メモリ使用**: スケジュール状態の適切なキャッシュ
- **レスポンシブ**: 設定変更に対する高速な再計算
- **一貫性**: UI状態とデータの同期維持

## 🎯 大会ステータス管理システム

### 基本概念

大会のライフサイクルを適切に管理するため、従来の単純なステータス（planning/ongoing/completed）から、日付ベースの動的ステータス判定システムに変更しました。

### ステータス分類

| ステータス | 英語表記 | 条件 | 説明 |
|------------|----------|------|------|
| **募集前** | `before_recruitment` | 現在 < 募集開始日 | まだ募集期間に達していない状態 |
| **募集中** | `recruiting` | 募集開始日 ≤ 現在 ≤ 募集終了日 | チーム募集を受付中の状態 |
| **開催前** | `before_event` | 募集終了日 < 現在 < 大会開始日 | 募集は終了したが大会開催前の状態 |
| **開催中** | `ongoing` | 大会開始日 ≤ 現在 ≤ 大会終了日 | 大会期間中の状態 |
| **終了** | `completed` | 現在 > 大会終了日 または DB状態が完了 | 大会が終了した状態 |

### 実装仕様

#### **動的ステータス判定（lib/tournament-status.ts）**
- 現在日時と各日付フィールドを比較してリアルタイム判定
- データベースの以下フィールドを活用：
  - `recruitment_start_date`: 募集開始日
  - `recruitment_end_date`: 募集終了日
  - `tournament_dates`: 大会開催日程（JSON形式）
  - `status`: DB上の手動設定ステータス

#### **主要関数**
```typescript
// ステータス動的判定
calculateTournamentStatus(tournament): TournamentStatus

// 表示用ラベル取得
getStatusLabel(status): string

// 表示用カラークラス取得
getStatusColor(status): string

// 開催期間フォーマット
formatTournamentPeriod(tournamentDatesJson): string
```

### ステータス更新タイミング

#### **🔄 自動更新（推奨）**
- **募集前 → 募集中**: 募集開始日 00:00 に自動更新
- **募集中 → 開催前**: 募集終了日 23:59 翌日に自動更新
- **開催前 → 開催中**: 大会開始日 00:00 に自動更新
- **開催中 → 終了**: 大会最終日 23:59 翌日に自動更新

#### **⚙️ 手動更新が必要な場面**
1. **早期終了**: 予定より早く大会を終了させる場合
2. **全試合確定**: 管理者が明示的に大会完了を宣言する場合
3. **例外対応**: 日程変更や特殊事情による状態調整

### 運用上の利点

1. **自動化**: 日付設定のみで大会ライフサイクルを自動管理
2. **リアルタイム**: ページアクセス時に常に最新ステータスを表示
3. **運用負荷軽減**: 手動でのステータス変更作業が不要
4. **一貫性**: 全ての画面で統一されたステータス表示
5. **検索精度**: より詳細な条件での大会検索が可能

### 技術的考慮事項

- ステータス判定は毎回計算されるため、大量データでは性能に注意
- タイムゾーンは日本時間（JST）を基準とする
- 日付比較は日単位で行い、時刻は考慮しない
- データベースの`status`フィールドは管理者による強制設定用として残存

## 🏢 複数チーム参加機能

### 基本概念

同一マスターチームが複数の大会参加エントリーを行える機能です。これにより、1つのチームが「チームA」「チームA2」といった形で同一大会に複数参加可能になります。

### 実装仕様

#### **データ構造**
- **マスターチーム** (`m_teams`): 実際のチーム組織（1つ）
- **大会参加チーム** (`t_tournament_teams`): 大会ごとの参加エントリー（複数可能）
- **参加選手** (`t_tournament_players`): 各大会参加チーム別の選手登録

#### **主要機能**
1. **複数エントリー登録**: 同じマスターチームから複数の大会参加申し込み
2. **個別チーム名**: 各エントリーで独自のチーム名・略称を設定可能
3. **選手振り分け**: マスター選手を各エントリーに個別に割り当て
4. **個別編集**: エントリーごとに独立した選手編集機能

### 技術的実装

#### **API設計**
- `POST /api/tournaments/[id]/join`: 新規参加（`mode=new`で複数参加対応）
- `PUT /api/tournaments/[id]/join`: 特定チーム編集（`team=123`パラメータ）
- `GET /api/teams/tournaments`: 複数参加情報を含む大会一覧取得

#### **UI/UX設計**
- **チーム一覧表示**: 参加チーム数バッジ + 詳細リスト
- **個別編集ボタン**: 各参加エントリーに専用編集リンク
- **追加参加ボタン**: 既参加大会への追加エントリー用

#### **データフロー**
```
マスターチーム → 複数の大会参加エントリー → 各エントリーの選手割り当て
     ↓                    ↓                          ↓
  m_teams        t_tournament_teams         t_tournament_players
```

## 📁 CSV一括登録機能（管理者代行）

### 基本概念

管理者が複数チームの情報をCSVファイルで一括登録し、各チームに仮パスワードを発行する機能です。大会運営の効率化とチーム登録の支援を目的としています。

### CSVファイル仕様

#### **フォーマット: マルチ行形式**
```csv
行種別,チーム名,略称,代表者名,メールアドレス,電話番号,選手名,背番号,ポジション
```

#### **行種別定義**
- `TEAM`: チーム基本情報行（選手情報カラムは空欄）
- `PLAYER`: 選手情報行（チーム情報カラムは空欄）
- `#`: コメント行（処理時に無視される）

#### **サンプルCSV**
```csv
行種別,チーム名,略称,代表者名,メールアドレス,電話番号,選手名,背番号,ポジション

TEAM,サンプルFC,サンプル,山田太郎,yamada@example.com,090-1234-5678,,,
PLAYER,,,,,,田中一郎,1,GK
PLAYER,,,,,,佐藤次郎,2,DF
PLAYER,,,,,,鈴木三郎,3,MF
PLAYER,,,,,,高橋四郎,,FW

TEAM,テストユナイテッド,テスト,鈴木花子,suzuki@example.com,080-9876-5432,,,
PLAYER,,,,,,中村太一,10,GK
PLAYER,,,,,,小林次郎,11,DF
PLAYER,,,,,,伊藤三郎,,MF
```

### 処理仕様

#### **バリデーション**
1. **必須項目チェック**: チーム名、略称、代表者名、メールアドレス、選手名
2. **形式チェック**: メールアドレス形式、背番号範囲（1-99）
3. **重複チェック**: チーム名・略称・メールアドレス、背番号（チーム内）
4. **制限チェック**: 選手数（1-20人）、列数（9列）

#### **登録処理**
1. **マスターチーム作成**: `m_teams`に登録（`registration_type = 'admin_proxy'`）
2. **選手マスター作成**: `m_players`に選手情報登録
3. **大会参加登録**: `t_tournament_teams`に参加エントリー
4. **参加選手登録**: `t_tournament_players`に選手割り当て
5. **仮パスワード発行**: 自動生成（`temp + 4桁ランダム`）

#### **エラーハンドリング**
- **行単位エラー表示**: 具体的なエラー内容と行番号
- **部分成功対応**: 成功チームと失敗チームの個別レポート
- **ロールバック**: チーム単位でのデータ整合性保証

### UI/UX設計

#### **3ステップワークフロー**
1. **CSVテンプレートダウンロード**: 形式説明付きテンプレート提供
2. **CSVファイルアップロード**: ドラッグ&ドロップ + ファイル選択
3. **プレビュー&一括登録**: エラーチェック + 登録実行

#### **視覚的フィードバック**
- 🔵 **ステップガイド**: 手順の明確化
- 🔴 **エラー表示**: 行番号付き詳細エラー
- 🟢 **プレビュー**: 登録前の内容確認
- 🟡 **結果レポート**: 成功/失敗の詳細表示

## 🔐 登録種別管理システム

### 基本概念

チーム代表者による自己登録と管理者による代行登録を区別し、適切な運用管理を可能にするシステムです。

### 実装仕様

#### **データベース設計**
```sql
-- m_teamsテーブル
registration_type TEXT DEFAULT 'self_registered'
-- 値: 'self_registered'（代表者登録）, 'admin_proxy'（管理者代行）
```

#### **区別表示**
- 🟢 **代表者登録**: 緑背景 + 「申し込み済み」ラベル
- 🟡 **管理者代行**: 黄背景 + 「管理者代行」ラベル + 説明アイコン

#### **運用メリット**
1. **パスワード管理**: 代行登録チームへの変更案内送信
2. **統計分析**: 登録方法別の分布データ
3. **セキュリティ**: 初期パスワード使用アカウントの特定

### 技術的実装

#### **自動設定**
- **チーム代表者登録**: `registration_type = 'self_registered'`（デフォルト）
- **管理者代行登録**: `registration_type = 'admin_proxy'`（API設定）
- **CSV一括登録**: `registration_type = 'admin_proxy'`（自動適用）

#### **クエリ例**
```sql
-- パスワード変更案内対象チーム
SELECT team_id, team_name, contact_email 
FROM m_teams 
WHERE registration_type = 'admin_proxy';

-- 登録方法別統計
SELECT registration_type, COUNT(*) as count
FROM m_teams 
GROUP BY registration_type;
```

## 📋 実装タスク（優先順）

Phase 1: 基盤構築
1.プロジェクト初期化
　・Next.js 14 プロジェクトセットアップ
　・必要なパッケージのインストール
　・基本的なフォルダ構成作成

2.データベース構築
　・Turso接続設定
　・DDL（CREATE TABLE文）生成・実行
　・初期データ投入

3.認証システム
　・NextAuth.js設定
　・管理者ログイン機能
　・チーム代表者ログイン機能

Phase 2: 管理機能実装
4.大会管理
　・大会作成フォーム（`/admin/tournaments/create`）
　・大会一覧・編集機能
　・API Routes実装

5.チーム・選手管理
　・チーム登録フォーム
　・選手登録・管理機能
　・チーム一覧表示

6.試合スケジュール
　・試合組み合わせ作成
　・ランダム組み合わせ機能
　・試合日程管理

Phase 3: 結果管理・公開
7.結果入力システム
　・試合結果入力フォーム
　・リアルタイム結果更新
　・結果確定機能

8.公開画面
　・一般向け大会情報表示
　・試合結果・星取表表示
　・レスポンシブ対応

## 🧩 設計方針と制約

- 複数大会の同時開催に対応（大会IDベースで全体を構成）
- チーム・選手は大会単位で分離（共通選手マスタは今回は不要）
- 管理側はPCでの閲覧を想定し、使用側はスマートフォン等からの閲覧を想定（レスポンシブ対応）
- 入力項目は設計ファイルの仕様に従う（文字数・IME・選択形式など）

## 🔧 環境設定・必要な設定
```bash
# 基本パッケージ
npm install next@14 react react-dom typescript @types/node @types/react @types/react-dom

# UI・スタイリング
npm install tailwindcss postcss autoprefixer @tailwindcss/forms @tailwindcss/typography
npm install @radix-ui/react-slot @radix-ui/react-dropdown-menu lucide-react
npm install class-variance-authority clsx tailwind-merge

# フォーム・バリデーション
npm install react-hook-form @hookform/resolvers zod

# データベース・認証
npm install @libsql/client next-auth@beta
npm install bcryptjs @types/bcryptjs

# 状態管理・ユーティリティ
npm install zustand date-fns

# 開発ツール
npm install -D eslint eslint-config-next prettier eslint-config-prettier
npm install -D @types/bcryptjs
```

### 環境変数（.env.local）
```bash
# Turso Database Configuration (開発用)
DATABASE_URL="libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io"
DATABASE_AUTH_TOKEN="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
# Turso Database (本番用)
#DATABASE_URL="libsql://ksm-prod-asditd.aws-ap-northeast-1.turso.io"
#DATABASE_AUTH_TOKEN="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNzcyMzEsImlkIjoiODYzZDdiZGItYmJhMy00YTY1LWJkMmEtNWI3YmI4NzFiMGMzIiwicmlkIjoiNTY4MjgwMTEtYjdjNi00YmU1LThiMmMtYjZjOTg4M2RmMjc4In0.TD-vd-nxW-Hfu-se8ScYaFyA41ZkvUO5az3dFkz-7YnPNp1ofum6NgUBKVGPnMaXoJvdpLxIxZbZdfEUi8A_Cg"

# Next.js Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret-here"

# Development/Production Environment
NODE_ENV="development"

# Optional: Admin Configuration
ADMIN_DEFAULT_EMAIL="admin@example.com"
ADMIN_DEFAULT_PASSWORD="admin123"
```

### 開発コマンド
```bash
# 開発サーバー起動
npm run dev

# 本番ビルド
npm run build

# 本番サーバー起動
npm run start

# コード品質チェック
npm run lint
npm run type-check

# データベース関連
npm run db:generate     # DDL生成
npm run db:migrate      # マイグレーション実行
npm run db:seed         # 初期データ投入
npm run db:seed-master  # マスターデータ登録（会場・フォーマット・テンプレート）
```

## 📝 コーディング規約・命名ルール
- ファイル・フォルダ名: kebab-case
- React コンポーネント: PascalCase
- 関数・変数: camelCase
- 定数: UPPER_SNAKE_CASE
- CSS クラス: kebab-case
- データベース: snake_case

### TypeScript 型定義例
```typescript
// lib/types.ts
export interface Tournament {
  tournament_id: number;
  tournament_name: string;
  format_id: number;
  venue_id: number;
  team_count: number;
  status: 'planning' | 'ongoing' | 'completed';
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Team {
  team_id: string;
  team_name: string;
  team_omission?: string;
  contact_person: string;
  contact_email: string;
  contact_phone?: string;
  is_active: boolean;
}

export interface Match {
  match_id: number;
  match_block_id: number;
  tournament_date: string;
  match_number: number;
  match_code: string;
  team1_id?: string;
  team2_id?: string;
  team1_display_name: string;
  team2_display_name: string;
  court_number?: number;
  start_time?: string;
  team1_goals: number;
  team2_goals: number;
  winner_team_id?: string;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  result_status: 'none' | 'pending' | 'confirmed';
  remarks?: string;
}
```

### ファイル・フォルダ構成（現在の実装状況）
```
ksm-app/
├── README.md
├── CLAUDE.md                     # プロジェクト仕様書
├── next.config.ts
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.tsbuildinfo
├── eslint.config.mjs
├── postcss.config.mjs
├── next-env.d.ts
├── middleware.ts                 # 認証ミドルウェア
├── dev-server.pid
├── .gitignore
│
├── docs/                         # ドキュメント
│   └── database/
│       ├── KSM.md                # ER図
│       ├── schema.sql            # DDL定義
│       └── schema-updated.sql    # 更新されたDDL
│
├── data/                         # マスターデータ
│   ├── venues.json
│   ├── tournament_formats.json
│   └── match_templates.json
│
├── scripts/                      # データベース・ユーティリティスクリプト
│   ├── init-db.ts
│   ├── seed-master-data.js
│   ├── add-tournament-players.js
│   ├── check-database-status.js
│   ├── check-db-data.js
│   ├── check-tournament-players-table.mjs
│   ├── create-tournament-players-table.sql
│   ├── create-tournament-players.js
│   ├── detailed-database-check.js
│   ├── fix-tournament-players-table.mjs
│   ├── fix-unique-constraints.mjs
│   ├── migrate-remove-match-order.js
│   ├── migrate-tournament-players.mjs
│   └── test-api.js
│
├── app/                          # App Router (Next.js 14)
│   ├── layout.tsx                # ルートレイアウト
│   ├── page.tsx                  # トップページ
│   ├── globals.css               # グローバルCSS
│   ├── actions.ts                # Server Actions
│   │
│   ├── auth/                     # 認証関連ルート
│   │   ├── login/
│   │   │   └── page.tsx          # ログインページ
│   │   └── register/
│   │       └── page.tsx          # 登録ページ
│   │
│   ├── admin/                    # 管理者画面
│   │   ├── page.tsx              # 管理者ダッシュボード
│   │   ├── tournaments/          # 大会管理
│   │   │   ├── create/
│   │   │   │   └── page.tsx      # 大会作成
│   │   │   └── [id]/
│   │   │       └── edit/
│   │   │           └── page.tsx  # 大会編集
│   │   ├── teams/                # チーム管理
│   │   │   └── register/         # チーム登録
│   │   ├── matches/              # 試合管理
│   │   │   └── schedule/         # スケジュール作成
│   │   └── results/              # 結果管理
│   │       └── input/            # 結果入力
│   │
│   ├── public/                   # 一般公開画面
│   │   └── tournaments/          # 公開大会情報
│   │
│   ├── team/                     # チーム向け画面
│   │   └── page.tsx              # チームダッシュボード
│   │
│   ├── tournaments/              # 大会関連ページ
│   │   └── [id]/
│   │       └── join/
│   │           └── page.tsx      # 大会参加
│   │
│   ├── test/                     # テストページ
│   │   └── page.tsx
│   │
│   └── api/                      # API Routes
│       ├── auth/                 # 認証API
│       │   └── [...nextauth]/
│       │       └── route.ts      # NextAuth設定
│       ├── tournaments/          # 大会API
│       │   ├── route.ts          # 大会CRUD
│       │   ├── dashboard/
│       │   │   └── route.ts      # ダッシュボード
│       │   ├── formats/
│       │   │   ├── recommend/
│       │   │   │   └── route.ts  # フォーマット推奨
│       │   │   └── [formatId]/
│       │   │       └── templates/
│       │   │           └── route.ts # テンプレート取得
│       │   └── [id]/
│       │       ├── route.ts      # 個別大会操作
│       │       ├── join/
│       │       │   └── route.ts  # 大会参加
│       │       └── matches/
│       │           └── route.ts  # 試合情報
│       ├── teams/                # チームAPI
│       │   ├── register/
│       │   │   └── route.ts      # チーム登録
│       │   ├── profile/
│       │   │   └── route.ts      # チームプロフィール
│       │   ├── tournaments/
│       │   │   └── route.ts      # チーム大会情報
│       │   └── players/
│       │       └── route.ts      # 選手管理
│       ├── venues/               # 会場API
│       │   └── route.ts          # 会場CRUD
│       ├── matches/              # 試合API（ディレクトリのみ）
│       └── results/              # 結果API（ディレクトリのみ）
│
├── components/                   # 共通コンポーネント
│   ├── ui/                       # shadcn/ui コンポーネント
│   │   ├── alert.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── checkbox.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   └── textarea.tsx
│   ├── layout/                   # レイアウト関連
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── providers/                # プロバイダー
│   │   └── session-provider.tsx  # セッション管理
│   ├── forms/                    # フォーム関連
│   │   ├── TournamentCreateForm.tsx
│   │   └── TournamentEditForm.tsx
│   ├── tables/                   # テーブル表示（ディレクトリのみ）
│   └── features/                 # 機能特化コンポーネント
│       ├── auth/
│       │   └── SignOutButton.tsx
│       ├── tournament/
│       │   ├── SchedulePreview.tsx
│       │   ├── TournamentDashboardList.tsx
│       │   └── TournamentJoinForm.tsx
│       ├── team/
│       │   ├── TeamProfile.tsx
│       │   └── TeamTournaments.tsx
│       ├── match/                # 試合関連（ディレクトリのみ）
│       └── standings/            # 順位表関連（ディレクトリのみ）
│
├── lib/                          # ユーティリティ・設定
│   ├── auth.ts                   # NextAuth設定
│   ├── db.ts                     # Turso接続
│   ├── utils.ts                  # 共通ユーティリティ
│   ├── validations.ts            # Zodスキーマ
│   ├── constants.ts              # 定数定義
│   ├── types.ts                  # TypeScript型定義
│   ├── schedule-calculator.ts    # スケジュール計算
│   ├── database-init.ts          # データベース初期化
│   ├── database-init-simple.ts   # 簡単データベース初期化
│   └── api/
│       └── tournaments.ts        # 大会API関数
│
├── hooks/                        # カスタムフック（ディレクトリのみ）
├── stores/                       # 状態管理（ディレクトリのみ）
├── types/                        # 型定義
│   └── next-auth.d.ts            # NextAuth型拡張
│
├── src/                          # 旧構造の残り
│   └── app/
│       ├── favicon.ico
│       ├── globals.css
│       ├── layout.tsx
│       └── page.tsx
│
└── public/                       # 静的ファイル
    ├── file.svg
    ├── globe.svg
    ├── next.svg
    ├── vercel.svg
    └── window.svg

```

## 実装状況

**✅ 実装済み機能:**
- 認証システム（NextAuth.js）
- 大会管理（作成・編集・参加）
- チーム管理・登録
- 選手管理
- 大会参加システム（選手選択機能付き）
- チームダッシュボード
- スケジュール計算機能
- データベース初期化スクリプト
- マスターデータ管理
- Server Actions実装
- 認証ミドルウェア

**🚧 未実装の主要機能:**
- 試合結果入力システム
- 星取表・順位表表示
- 一般公開ページの詳細実装
- リアルタイム更新機能
- 管理者用試合管理画面
- 詳細な試合スケジュール表示

**📁 注目すべき追加ファイル:**
- `app/actions.ts` - Server Actions
- `middleware.ts` - 認証ミドルウェア
- `lib/schedule-calculator.ts` - スケジュール自動生成
- `scripts/` - 多数のデータベース管理スクリプト
- `data/` - マスターデータのJSONファイル
- `lib/api/tournaments.ts` - 大会API関数

### コード品質
- ESLint + Prettier準拠
- TypeScriptの型安全性を重視
- API呼び出しはSWRまたはfetch使用
- エラーハンドリングを適切に実装

## 🚀 セットアップ手順

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env.local`ファイルを作成し、上記の環境変数を設定

### 3. データベースの初期化
```bash
npm run db:generate  # DDL生成
npm run db:migrate   # テーブル作成
npm run db:seed      # 初期データ投入（必要に応じて）
```

### 4. マスターデータの登録
テスト用のマスターデータ（会場、大会フォーマット、試合テンプレート）を登録できます。

#### 自動登録（推奨）
```bash
npm run db:seed-master
```

#### 手動でデータを編集する場合
以下のJSONファイルを編集してからコマンドを実行：

**`./data/venues.json`** - 会場データ
```json
[
  {
    "venue_name": "中央スポーツパーク",
    "address": "東京都中央区スポーツ1-1-1", 
    "available_courts": 8,
    "is_active": 1
  }
]
```

**`./data/tournament_formats.json`** - 大会フォーマットデータ
```json
[
  {
    "format_name": "8チーム予選リーグ+決勝トーナメント",
    "target_team_count": 8,
    "format_description": "8チームを2ブロック（A・B）に分け、各ブロック4チームのリーグ戦。各ブロック上位2チームが決勝トーナメントに進出。"
  }
]
```

**`./data/match_templates.json`** - 試合テンプレートデータ
```json
[
  {
    "format_id": 1,
    "match_number": 1,
    "match_code": "A1",
    "match_type": "通常",
    "phase": "preliminary",
    "round_name": "予選Aブロック",
    "block_name": "A",
    "team1_source": "",
    "team2_source": "",
    "team1_display_name": "A1チーム",
    "team2_display_name": "A2チーム",
    "day_number": 1,
    "execution_priority": 1
  }
]
```

**データ登録の特徴:**
- 既存データを自動削除してから新規登録
- 登録件数を表示して確認可能
- スケジュールプレビューで即座に動作確認できる

### 5. 開発サーバー起動
```bash
npm run dev
```

## 💬 その他の支援依頼（任意）

- 設計書をテーブルごとに `.jpg` または `.md` に変換して可視化
- Vercel + Turso の自動デプロイ設定
- 認証機能の実装（NextAuth.js等）
- リアルタイム更新機能の実装（WebSocket/Server-Sent Events）





