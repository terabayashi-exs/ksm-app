# スポンサーバナー管理システム

## 📋 概要

部門詳細画面（公開ページ）に広告バナーを表示するための管理システム。
管理者が大会ごとにスポンサーバナーを登録・管理し、一般ユーザーが閲覧する部門詳細画面に表示されます。

## 🎯 主要機能

### 1. バナー登録・管理
- **バナー作成**: 画像アップロード、リンクURL設定、表示設定
- **バナー編集**: 既存バナーの情報更新、画像差し替え
- **バナー削除**: バナー削除時のBlob画像自動削除
- **一覧表示**: 大会別のバナー一覧、フィルタリング

### 2. 表示位置制御
3つの表示位置から選択可能：
- **タブ上部（top）**: 各タブコンテンツの最上部に表示
- **サイドバー（sidebar）**: メインコンテンツ右側に表示（PC表示のみ）
- **タブ下部（bottom）**: 各タブコンテンツの最下部に表示

推奨画像サイズ:
- タブ上部: 728 × 90px（リーダーボード）
- サイドバー: 200 × 200px（スクエア）
- タブ下部: 728 × 90px（リーダーボード）

### 3. タブ別表示制御
表示対象タブを細かく指定可能：
- **全タブ（all）**: すべてのタブで表示
- **概要（overview）**: 部門概要タブのみ
- **日程・結果（schedule）**: 日程・結果タブのみ
- **予選結果（preliminary）**: 予選結果タブのみ
- **決勝結果（final）**: 決勝結果タブのみ
- **順位表（standings）**: 順位表タブのみ
- **参加チーム（teams）**: 参加チームタブのみ

### 4. 表示期間設定
- **開始日**: バナー表示開始日（省略可）
- **終了日**: バナー表示終了日（省略可）
- **有効/無効切り替え**: `is_active`フラグで即座にON/OFF可能

### 5. クリック数トラッキング
- バナークリック時にAPIエンドポイント経由でカウント
- `/api/public/sponsor-banners/[id]/click` - クリック数カウントAPI
- 管理画面でクリック数確認可能

### 6. 画像管理（Vercel Blob Storage）
- **自動アップロード**: バナー作成・更新時に自動でBlobにアップロード
- **自動削除**: バナー削除・更新・大会削除時に古い画像を自動削除
- **ファイル情報管理**: ファイル名、ファイルサイズを記録

## 🗄️ データベース設計

### t_sponsor_banners テーブル

```sql
CREATE TABLE IF NOT EXISTS t_sponsor_banners (
  banner_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  banner_name TEXT NOT NULL,
  banner_url TEXT,
  image_blob_url TEXT NOT NULL,
  image_filename TEXT,
  file_size INTEGER,
  display_position TEXT NOT NULL CHECK(display_position IN ('top', 'bottom', 'sidebar')),
  target_tab TEXT NOT NULL DEFAULT 'all' CHECK(target_tab IN ('all', 'overview', 'schedule', 'preliminary', 'final', 'standings', 'teams')),
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
  start_date DATE,
  end_date DATE,
  click_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
  FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sponsor_banners_display
ON t_sponsor_banners(tournament_id, target_tab, display_position, display_order);

CREATE INDEX IF NOT EXISTS idx_sponsor_banners_active
ON t_sponsor_banners(tournament_id, is_active);

CREATE INDEX IF NOT EXISTS idx_sponsor_banners_dates
ON t_sponsor_banners(start_date, end_date);
```

### カラム説明
- `banner_id`: バナーID（主キー）
- `tournament_id`: 大会ID（外部キー、CASCADE削除）
- `banner_name`: バナー名称（管理用）
- `banner_url`: リンク先URL（オプション）
- `image_blob_url`: Blob Storage画像URL
- `image_filename`: 元ファイル名
- `file_size`: ファイルサイズ（バイト）
- `display_position`: 表示位置（top/bottom/sidebar）
- `target_tab`: 表示対象タブ
- `display_order`: 表示順序（昇順）
- `is_active`: 有効/無効フラグ
- `start_date`: 表示開始日（オプション）
- `end_date`: 表示終了日（オプション）
- `click_count`: クリック数
- `created_at`: 作成日時（JST）
- `updated_at`: 更新日時（JST）

## 🔌 APIエンドポイント

### 管理者用API

#### バナー一覧取得
```
GET /api/admin/sponsor-banners?tournament_id={id}
```

#### バナー作成
```
POST /api/admin/sponsor-banners
Content-Type: application/json

{
  "tournament_id": 1,
  "banner_name": "スポンサーA",
  "banner_url": "https://example.com",
  "image_blob_url": "https://blob.vercel-storage.com/...",
  "display_position": "top",
  "target_tab": "all",
  "display_order": 0,
  "is_active": 1
}
```

#### バナー更新
```
PATCH /api/admin/sponsor-banners/[id]
Content-Type: application/json

{
  "banner_name": "スポンサーA（更新）",
  "is_active": 0
}
```

#### バナー削除
```
DELETE /api/admin/sponsor-banners/[id]
```

#### 画像アップロード
```
POST /api/admin/sponsor-banners/upload
Content-Type: multipart/form-data

file: [画像ファイル]
tournament_id: 1
```

### 公開API

#### バナー取得
```
GET /api/public/sponsor-banners?tournament_id={id}&position={position}&tab={tab}
```

#### クリック数カウント
```
POST /api/public/sponsor-banners/[id]/click
```

## 🎨 フロントエンド実装

### コンポーネント構成

#### 管理画面
- **SponsorBannerList.tsx**: バナー一覧表示
- **SponsorBannerForm.tsx**: バナー作成・編集フォーム
- ページ: `/admin/tournaments/[id]/sponsor-banners`

#### 公開画面
- **SponsorBanners.tsx**: バナー表示コンポーネント
- **TabContentWithSidebar.tsx**: サイドバー付きレイアウト
- **useSidebarBanners.ts**: サイドバーバナー有無判定フック

### 動的レイアウト制御

サイドバーバナーの有無に応じて、レイアウトを動的に変更：

```typescript
// サイドバーバナーが存在する場合
<div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-6">
  {/* メインコンテンツ（70%） */}
  <div className="min-w-0">{children}</div>

  {/* サイドバー（200px固定幅）*/}
  <aside className="hidden lg:block space-y-4">
    <SponsorBanners position="sidebar" />
  </aside>
</div>

// サイドバーバナーが存在しない場合
<div>
  {children} {/* 全幅表示 */}
</div>
```

### レスポンシブ対応
- **PC表示**: すべての表示位置（top, sidebar, bottom）が表示
- **スマホ/タブレット**: サイドバーは非表示、top/bottomのみ表示
- **注意書き**: 管理画面でサイドバー選択時に「PC表示のみ」の注意書きを表示

## 🔒 セキュリティ

### アクセス制御
- 管理者APIは認証必須（NextAuth.jsセッション）
- 公開APIは認証不要（一般ユーザーアクセス可能）

### バリデーション
- 画像サイズ制限: 最大5MB
- 画像形式制限: JPEG, PNG, GIF, WebP
- URL形式検証: リンクURLの形式チェック

## 📊 実装状況

### ✅ 実装完了
- バナー管理画面（一覧・作成・編集・削除）
- 画像アップロード・自動削除
- 公開ページ表示
- クリック数トラッキング
- 動的レイアウト制御
- レスポンシブ対応
- 表示期間・有効無効制御
- タブ別・位置別表示制御

### 📈 運用実績
- **実装日**: 2026年1月13日
- **テーブル数**: 1（t_sponsor_banners）
- **APIエンドポイント**: 6件
- **画面数**: 3画面（一覧・作成・編集）

## 🔗 関連ファイル

### データベース
- `lib/db.ts` - データベース接続

### API
- `app/api/admin/sponsor-banners/route.ts` - 一覧・作成
- `app/api/admin/sponsor-banners/[id]/route.ts` - 更新・削除
- `app/api/admin/sponsor-banners/upload/route.ts` - 画像アップロード
- `app/api/public/sponsor-banners/route.ts` - 公開バナー取得
- `app/api/public/sponsor-banners/[id]/click/route.ts` - クリック数カウント

### コンポーネント
- `components/admin/SponsorBannerForm.tsx` - バナーフォーム
- `components/public/SponsorBanners.tsx` - バナー表示
- `components/public/TabContentWithSidebar.tsx` - レイアウト

### ユーティリティ
- `lib/sponsor-banner-specs.ts` - バナー仕様定義
- `lib/blob-helpers.ts` - Blob削除ヘルパー
- `hooks/useSidebarBanners.ts` - サイドバーバナー検出

### ページ
- `app/admin/tournaments/[id]/sponsor-banners/page.tsx` - バナー一覧
- `app/admin/tournaments/[id]/sponsor-banners/create/page.tsx` - バナー作成
- `app/admin/tournaments/[id]/sponsor-banners/[bannerId]/edit/page.tsx` - バナー編集
- `app/public/tournaments/[id]/page.tsx` - 公開ページ（バナー表示）

## 💡 今後の拡張案

- [ ] A/Bテスト機能
- [ ] インプレッション数トラッキング
- [ ] バナーローテーション機能
- [ ] クリック率分析ダッシュボード
- [ ] 動画バナー対応
- [ ] アニメーションバナー対応

---

**最終更新**: 2026年1月13日
**ステータス**: 本番運用可能
