# CSV一括登録システム（完全仕様）

[← 実装済み機能一覧に戻る](./implemented-features.md)

## 📁 CSV一括登録システム（完全仕様）

### マルチ行形式CSV処理

#### **ファイル形式仕様**
```csv
行種別,チーム名,略称,代表者名,メールアドレス,電話番号,選手名,背番号,ポジション

TEAM,エクシーズPK部,Exs,田中代表,tanaka@example.com,090-1234-5678,,,
PLAYER,,,,,,田中選手,1,GK
PLAYER,,,,,,佐藤選手,2,DF
PLAYER,,,,,,鈴木選手,3,MF

TEAM,サンダーボルトFC,サンダー,山田代表,yamada@example.com,080-9876-5432,,,
PLAYER,,,,,,山田選手,10,GK
PLAYER,,,,,,高橋選手,11,DF
```

#### **処理エンジン**
```typescript
// app/api/admin/tournaments/[id]/teams/route.ts
interface CSVProcessingResult {
  successCount: number;
  errorCount: number;
  errors: CSVError[];
  teams: ProcessedTeam[];
  temporaryPasswords: GeneratedPassword[];
}
```

#### **バリデーション機能**
- **構造チェック**: 行種別・列数・必須項目
- **データ整合性**: 重複チェック・形式チェック
- **ビジネスルール**: 選手数制限・背番号範囲
- **エラーレポート**: 行番号付き詳細エラー表示

#### **セキュリティ機能**
- **仮パスワード生成**: `temp + 4桁ランダム数字`
- **登録種別管理**: `registration_type = 'admin_proxy'`
- **データ暗号化**: パスワードハッシュ化
- **アクセス制御**: 管理者権限必須

### UI実装

#### **3ステップワークフロー***
1. **テンプレートダウンロード**: 形式説明付きサンプルファイル
2. **ファイルアップロード**: ドラッグ&ドロップ + バリデーション
3. **プレビュー&実行**: エラーチェック後の一括登録

#### **結果表示**
- **成功チーム**: チーム名・選手数・仮パスワード表示
- **エラーチーム**: 詳細エラー内容・修正提案
- **統計サマリー**: 成功率・処理時間・データ概要

