# 大会アーカイブ復元スクリプト

アーカイブされた大会データからテーブルレコードを復元するためのスクリプト群です。

## 📁 スクリプト一覧

### 1. `restore-from-archive.js`
アーカイブJSONデータから完全にデータベースレコードを復元します。

### 2. `delete-tournament-data.js`
大会の関連データを安全に削除します（t_tournaments以外）。

### 3. `test-version-system.js`
アーカイブシステムの状態を確認・テストします。

## 🚀 使用方法

### 環境変数の設定
```bash
export DATABASE_URL="your-turso-database-url"
export DATABASE_AUTH_TOKEN="your-turso-auth-token"
```

### データ削除（テスト用）
```bash
# 大会ID:9の関連データを削除
node scripts/delete-tournament-data.js 9
```

### データ復元
```bash
# 大会ID:9をアーカイブデータから復元
node scripts/restore-from-archive.js 9
```

### システム状態確認
```bash
# アーカイブシステムの全体状況を確認
node scripts/test-version-system.js
```

## 🔧 復元処理の詳細

### 復元されるデータ
- ✅ **t_match_blocks**: ブロック情報（新しいIDで再作成）
- ✅ **t_tournament_teams**: 参加チーム情報
- ✅ **t_matches_live**: 全試合データ
- ✅ **t_matches_final**: 確定済み試合結果
- ✅ **t_match_blocks.team_rankings**: 順位表JSON
- ✅ **t_tournaments.is_archived**: アーカイブフラグ維持

### 復元されないデータ（必要に応じて拡張可能）
- ❌ **t_tournament_players**: 参加選手詳細データ
- ❌ **m_teams, m_players**: マスターデータ
- ❌ **外部ファイル**: PDF、画像など

### 処理フロー
1. **アーカイブデータ確認**: JSONデータの存在・内容確認
2. **既存データ削除**: 競合するレコードを安全削除
3. **ブロック復元**: 新しいIDでブロック再作成
4. **チーム復元**: 参加チーム情報復元
5. **試合復元**: ライブ試合＋確定結果復元
6. **順位表復元**: 計算済み順位表復元
7. **整合性確認**: 復元データの件数確認

## ⚠️ 重要な注意事項

### 安全性
- ✅ **確認プロンプト**: 危険な操作前にユーザー確認
- ✅ **段階的処理**: 各ステップの成功を確認
- ✅ **エラーハンドリング**: 失敗時の適切な処理
- ✅ **データ検証**: 復元後の件数確認

### 制限事項
- 🔄 **ID変更**: block_idは新しい値で再作成される
- 🔄 **時刻更新**: created_at, updated_atは現在時刻に設定
- 🔄 **完全置換**: 既存データは完全に置き換えられる

### データベース制約
- Tursoの制約により、トランザクションは使用できません
- エラー発生時は手動での部分復旧が必要な場合があります

## 🧪 テスト手順（推奨）

### 1. 事前確認
```bash
# アーカイブ状況確認
node scripts/test-version-system.js

# 現在のデータ状況確認
# アプリケーションで大会ID:9の表示を確認
```

### 2. データ削除テスト
```bash
# 関連データを削除
node scripts/delete-tournament-data.js 9

# アプリケーションで削除結果確認
# -> データが空になることを確認
```

### 3. アーカイブ表示テスト
```bash
# アーカイブページにアクセス
# /public/tournaments/9/archived
# -> アーカイブデータから正常に表示されることを確認
```

### 4. データ復元テスト
```bash
# アーカイブから復元
node scripts/restore-from-archive.js 9

# アプリケーションで復元結果確認
# -> 元の状態に戻っていることを確認
```

## 📊 復元可能性チェック

### アーカイブデータの完全性
```bash
# アーカイブJSONの内容確認
node -e "
const { createClient } = require('@libsql/client');
const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function check() {
  const result = await db.execute(\`
    SELECT 
      LENGTH(tournament_data) as tournament_size,
      LENGTH(teams_data) as teams_size,
      LENGTH(matches_data) as matches_size,
      LENGTH(standings_data) as standings_size,
      metadata
    FROM t_archived_tournament_json WHERE tournament_id = 9
  \`);
  
  console.log('アーカイブデータサイズ:');
  console.log(result.rows[0]);
  
  if (result.rows[0].metadata) {
    console.log('メタデータ:', JSON.parse(result.rows[0].metadata));
  }
  
  await db.close();
}

check();
"
```

## 🔄 継続的運用

### 自動バックアップ（推奨）
```bash
# 定期的にアーカイブデータをエクスポート
node -e "
// t_archived_tournament_json のデータをファイル出力
// 外部ストレージへの自動バックアップ実装可能
"
```

### 監視・アラート
- アーカイブデータの破損チェック
- 復元テストの定期実行
- データ整合性の継続的確認

## 🆘 トラブルシューティング

### よくある問題

1. **復元時のID不整合**
   - 症状: 外部キー制約エラー
   - 対処: block_idマッピングの確認・修正

2. **JSON解析エラー**
   - 症状: JSON.parse() 失敗
   - 対処: アーカイブデータの手動確認・修復

3. **部分復元**
   - 症状: 一部のテーブルのみ復元済み
   - 対処: 手動での残りテーブル復元

### 緊急時の対応
```bash
# 最小限の復元（大会基本情報のみ）
# 手動SQLでの部分復旧
# 管理者による手動データ再入力
```

---

**注意**: このスクリプトは本番環境での使用を想定していますが、初回実行時は必ず開発環境でテストしてください。