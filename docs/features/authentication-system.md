# 認証・セキュリティシステム

## 概要

KSM-Appの認証・セキュリティシステムは、管理者とチーム代表者の2つのロールを分離し、安全なユーザー登録とログインを提供します。

## 機能一覧

### 1. ログイン分離

#### 実装内容
- **管理者ログイン**: `/auth/admin/login`
  - 管理者専用のログインページ
  - 管理者IDとパスワードによる認証
  - 認証後は管理画面にリダイレクト

- **チーム代表者ログイン**: `/auth/team/login`
  - チーム代表者専用のログインページ
  - チームIDとパスワードによる認証
  - 認証後はチームダッシュボードにリダイレクト
  - パスワードリセット機能へのリンク

#### 技術仕様
```typescript
// NextAuth credentials provider
{
  id: "admin",
  name: "Admin",
  credentials: {
    adminId: { label: "管理者ID", type: "text" },
    password: { label: "パスワード", type: "password" }
  }
}

{
  id: "team",
  name: "Team",
  credentials: {
    teamId: { label: "チームID", type: "text" },
    password: { label: "パスワード", type: "password" }
  }
}
```

#### ミドルウェア保護
```typescript
// middleware.ts
const protectedRoutes = {
  '/admin': ['admin'],
  '/team': ['team'],
  '/tournaments/[id]/manage': ['admin']
}
```

---

### 2. メール認証によるチーム登録

#### 登録フロー

1. **メールアドレス入力** (`/auth/register/email`)
   - ユーザーがメールアドレスを入力
   - メールアドレスの重複チェック
   - 認証メール送信

2. **メール認証**
   - 10分間有効な認証トークンを生成
   - メールに認証リンクを送信
   - トークンはワンタイムトークン（使用後は無効化）

3. **チーム情報入力** (`/auth/register?token=xxx`)
   - トークン検証（有効期限、使用済みチェック）
   - メールアドレスは読み取り専用で表示
   - チーム情報と選手情報を入力
   - 登録完了後は自動ログイン

#### データベース設計

```sql
CREATE TABLE t_email_verification_tokens (
  token_id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK(purpose IN ('registration', 'password_reset')),
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', '+9 hours')),
  used_at TEXT
);

-- インデックス
CREATE INDEX idx_email_verification_token ON t_email_verification_tokens(token);
CREATE INDEX idx_email_verification_email ON t_email_verification_tokens(email);
CREATE INDEX idx_email_verification_expires ON t_email_verification_tokens(expires_at);
```

#### API エンドポイント

**1. メール認証リクエスト**
```typescript
// POST /api/auth/request-verification
{
  email: string
}

// Response
{
  success: boolean,
  message: string
}
```

**処理内容**:
- メールアドレスの形式チェック
- メールアドレスの重複チェック（m_teams.contact_email）
- 既存の未使用トークンを無効化
- 新しいトークンを生成（crypto.randomBytes(32)）
- トークン有効期限を10分後に設定
- 認証メールを送信

**2. トークン検証**
```typescript
// POST /api/auth/verify-token
{
  token: string
}

// Response
{
  success: boolean,
  email: string,
  error?: string
}
```

**検証内容**:
- トークンの存在チェック
- 使用済みチェック
- 有効期限チェック
- メールアドレスの重複チェック（再確認）

#### メールテンプレート

```html
件名: 【楽勝 GO】チーム登録のご案内

本文:
楽勝 GOへのチーム登録ありがとうございます。

以下のリンクをクリックして、チーム登録を完了してください。
[チーム登録を完了する]

このリンクは10分間有効です。
有効期限が切れた場合は、再度チーム登録申請を行ってください。

このメールに心当たりがない場合は、削除してください。
```

#### セキュリティ対策

1. **メールアドレス所有権確認**
   - トークンをメールで送信することで、メールアドレスの所有権を確認
   - なりすまし登録を防止

2. **トークン有効期限**
   - 10分間の短い有効期限
   - タイムアウト後は再申請が必要

3. **ワンタイムトークン**
   - 1回使用したトークンは無効化
   - 再利用を防止

4. **既存トークンの無効化**
   - 新しいトークン生成時に既存の未使用トークンを無効化
   - トークン乱立を防止

---

### 3. チーム登録UI改善

#### パスワード表示切替

```typescript
const [showPassword, setShowPassword] = useState(false);
const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);

<Input
  type={showPassword ? "text" : "password"}
  {...form.register('password')}
/>
<button onClick={() => setShowPassword(!showPassword)}>
  {showPassword ? <EyeOff /> : <Eye />}
</button>
```

#### 選手登録の任意化

**バリデーション変更**:
```typescript
// Before
players: z.array(playerRegisterSchema)
  .min(1, '最低1人の選手を登録してください')

// After
players: z.array(playerRegisterSchema)
  .min(0, '選手は0人以上で登録してください')
```

**UI変更**:
- ラベルを「選手登録 *」→「選手登録（任意）」に変更
- 最後の選手も削除可能に
- デフォルト値を空配列に変更
- 説明文を「選手登録は任意です。後から追加することも可能です」に変更

#### エラーハンドリング強化

**チームID重複時**:
```typescript
// 事前チェック
const existingTeam = await db.execute(
  'SELECT team_id FROM m_teams WHERE team_id = ?',
  [data.team_id]
);

if (existingTeam.rows.length > 0) {
  return NextResponse.json({
    success: false,
    error: 'このチームIDは既に登録されています。別のチームIDをお選びください。',
    field: 'team_id'
  }, { status: 409 });
}

// UNIQUE制約エラーのキャッチ
if (error.message.includes('UNIQUE constraint failed')) {
  if (error.message.includes('team_id')) {
    return NextResponse.json({
      success: false,
      error: 'このチームIDは既に登録されています。別のチームIDをお選びください。',
      field: 'team_id'
    }, { status: 409 });
  }
}
```

**フロントエンド表示**:
```typescript
if (result.field) {
  // 特定のフィールドにエラーを表示
  form.setError(result.field as keyof TeamWithPlayersRegisterForm, {
    type: 'server',
    message: result.error
  });
} else {
  // 全体エラーとして表示
  setError(result.error);
}
```

---

### 4. パスワードリセット機能

#### 機能概要
- メール認証方式
- トークン有効期限: 1時間
- ワンタイムトークン
- 同じ `t_email_verification_tokens` テーブルを使用（purpose='password_reset'）

---

## 実装ファイル

### API
- `/app/api/auth/request-verification/route.ts` - メール認証リクエスト
- `/app/api/auth/verify-token/route.ts` - トークン検証
- `/app/api/teams/register/route.ts` - チーム登録（トークン検証含む）

### ページ
- `/app/auth/admin/login/page.tsx` - 管理者ログイン
- `/app/auth/team/login/page.tsx` - チーム代表者ログイン
- `/app/auth/register/email/page.tsx` - メールアドレス入力
- `/app/auth/register/page.tsx` - チーム登録フォーム

### 共通
- `/lib/validations.ts` - バリデーションスキーマ
- `/middleware.ts` - ルート保護

---

## セキュリティ考慮事項

1. **パスワード保護**
   - bcryptによるハッシュ化（12ラウンド）
   - 最低6文字以上

2. **トークン生成**
   - crypto.randomBytes(32) による暗号学的に安全なトークン生成
   - 256ビットのランダム性

3. **レート制限**
   - メール送信は10分に1回（トークン有効期限内）
   - 既存トークン無効化による重複防止

4. **CSRF対策**
   - NextAuth.jsによるセッション管理
   - SameSite Cookie

5. **SQLインジェクション対策**
   - パラメータ化クエリの使用
   - 入力バリデーション

---

## 運用上の注意点

### トークン管理
- 有効期限切れトークンは定期的にクリーンアップ推奨
- 使用済みトークンの監視

### メール送信
- Gmail SMTP経由（環境変数で設定）
- 送信失敗時の適切なエラーメッセージ

### エラーハンドリング
- 開発環境では詳細なエラー情報を返す
- 本番環境ではユーザーフレンドリーなメッセージのみ

---

## 今後の拡張予定

- 2要素認証（2FA）
- ソーシャルログイン（Google, Lineなど）
- セッションタイムアウトの設定
- ログイン履歴の記録
- 不正アクセス検知

---

**最終更新**: 2025年12月23日
**実装状態**: 完全実装・本番運用中
