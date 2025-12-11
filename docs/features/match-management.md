# 試合管理システム

[← 実装済み機能一覧に戻る](./implemented-features.md)

## 🎮 試合管理システム

### 基本概念

管理者が大会の全試合を統合管理し、リアルタイムで試合進行状況を監視・制御できる包括的なシステムです。試合開始から結果確定まで、大会運営に必要な全ての機能を一元化しています。

### 主要機能

#### **1. リアルタイム試合監視**
- **Server-Sent Events (SSE)** による試合状況のリアルタイム更新
- 試合状態（scheduled → ongoing → completed → confirmed）の自動追跡
- 現在進行中の試合とピリオド情報の表示

#### **2. ブロック別試合管理**
- **予選ブロック**: A, B, C, Dブロック別の色分け表示
- **決勝トーナメント**: トーナメント形式での表示
- 各ブロックの試合数とフィルタリング機能

#### **3. 包括的な試合情報表示**
```typescript
interface MatchDisplay {
  基本情報: {
    試合コード: string;      // 'A1', 'B2', 'SF1'など
    対戦カード: string;      // 実際のチーム名 + 勝者への👑マーク
    開催日: string;         // 日本語形式の日付
    コート: number;         // 使用コート番号
    時間: string;          // 予定時刻 or 実際の開始〜終了時刻
  };
  結果情報: {
    スコア: string;         // '3 - 1' 形式
    勝利チーム: string;     // 👑マーク付きで強調
    確定状態: boolean;      // 青色(確定済み) or オレンジ色(確定待ち)
  };
  進行状況: {
    試合状態: MatchStatus;  // scheduled/ongoing/completed/cancelled
    現在ピリオド: number;    // 進行中の場合のみ表示
  };
}
```

#### **4. 高度なフィルタリング機能**
| フィルター | 対象試合 | 表示内容 |
|------------|----------|----------|
| **全試合** | 全ての試合 | 大会の全試合一覧 |
| **試合前** | `match_status = 'scheduled'` | 未開始の試合 |
| **進行中** | `match_status = 'ongoing'` | 現在実施中の試合 |
| **完了** | `match_status = 'completed'` | 終了済みの試合 |
| **確定待ち** | `completed && !is_confirmed` | 結果入力済みだが未確定 |

#### **5. QRコード生成・審判アクセス機能**
- **QRコード表示**: 別タブで視覚的なQRコード画像を生成
- **直接アクセス**: 管理者による審判画面への直接アクセス
- **JWT認証**: セキュアな審判用トークン生成

#### **6. インライン結果確定機能**
```typescript
// 試合結果確定の流れ
t_matches_live → 結果入力・保存 → 管理者確認 → t_matches_final移行
```

### 技術実装

#### **主要ファイル**
- **`/app/admin/tournaments/[id]/matches/page.tsx`**: メインUI
- **`/app/api/tournaments/[id]/matches/route.ts`**: 試合データ取得API
- **`/app/api/matches/[id]/confirm/route.ts`**: 結果確定API
- **`/app/api/tournaments/[id]/live-updates/route.ts`**: SSEによるリアルタイム更新

#### **データフロー**
```
1. 試合一覧取得 → ブロック別グループ化
    ↓
2. SSE接続 → リアルタイム状態更新
    ↓
3. QRコード生成 → 審判アクセス
    ↓
4. 結果確定 → t_matches_final移行
    ↓
5. 順位表自動更新
```

#### **状態管理**
```typescript
const [matches, setMatches] = useState<MatchData[]>([]);        // 全試合データ
const [matchBlocks, setMatchBlocks] = useState<MatchBlock[]>(); // ブロック別グループ
const [confirmingMatches, setConfirmingMatches] = useState<Set<number>>(); // 確定処理中
const [filter, setFilter] = useState<FilterType>('all');       // フィルター状態
```

#### **リアルタイム更新機能**
```typescript
useEffect(() => {
  const eventSource = new EventSource(`/api/tournaments/${tournamentId}/live-updates`);
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'status_update') {
      setMatches(prevMatches => 
        prevMatches.map(match => {
          const update = data.updates.find(u => u.match_id === match.match_id);
          return update ? { ...match, ...update } : match;
        })
      );
    }
  };

  return () => eventSource.close();
}, [tournamentId]);
```

### 視覚的特徴

#### **ブロック色分けシステム**
- 🔵 **Aブロック**: 青色系 (`bg-blue-100 text-blue-800`)
- 🟢 **Bブロック**: 緑色系 (`bg-green-100 text-green-800`)
- 🟡 **Cブロック**: 黄色系 (`bg-yellow-100 text-yellow-800`)
- 🟣 **Dブロック**: 紫色系 (`bg-purple-100 text-purple-800`)
- 🔴 **決勝トーナメント**: 赤色系 (`bg-red-100 text-red-800`)

#### **試合状態バッジ**
- ⏰ **試合前**: 灰色バッジ + 時計アイコン
- ▶️ **進行中**: 緑色バッジ + アニメーション + 再生アイコン
- ✅ **完了**: 青色バッジ + チェックアイコン
- ⚠️ **確定待ち**: 黄色バッジ + 警告表示
- ❌ **中止**: 赤色バッジ + Xアイコン

#### **勝者表示システム**
```typescript
// 勝利チームに👑マークを自動付与
const winnerDisplay = isTeam1Winner 
  ? '👑 チームA vs チームB'
  : 'チームA vs 👑 チームB';

// スコア色分け
const scoreColor = match.is_confirmed ? 'text-blue-600' : 'text-orange-600';
```

### アクション機能

#### **QRコード生成**
```typescript
const generateQR = (matchId: number, matchCode: string) => {
  const qrUrl = `/admin/matches/${matchId}/qr`;
  window.open(qrUrl, '_blank', 'width=600,height=800');
};
```

#### **結果確定**
```typescript
const confirmMatch = async (matchId: number, matchCode: string) => {
  const response = await fetch(`/api/matches/${matchId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  // UI状態を即座に更新（ページ遷移なし）
  setMatches(prev => prev.map(match => 
    match.match_id === matchId ? { ...match, is_confirmed: true } : match
  ));
};
```

### 統計情報ダッシュボード

リアルタイム統計の自動計算・表示：
- **試合前**: `matches.filter(m => m.match_status === 'scheduled').length`
- **進行中**: `matches.filter(m => m.match_status === 'ongoing').length`
- **確定待ち**: `matches.filter(m => m.match_status === 'completed' && !m.is_confirmed).length`
- **確定済み**: `matches.filter(m => m.is_confirmed).length`

### セキュリティ・認証

#### **管理者権限チェック**
```typescript
const session = await auth();
if (!session || session.user.role !== 'admin') {
  return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
}
```

#### **JWT審判トークン**
- 試合固有の時間制限付きトークン生成
- 開発環境では長時間有効、本番環境では試合時間に応じて制限

### 運用上の利点

1. **集中管理**: 全試合を一画面で管理可能
2. **リアルタイム性**: 試合状況の即座な把握
3. **効率的運営**: QRコードによる迅速な審判アクセス
4. **確実性**: 結果確定プロセスの可視化
5. **統計把握**: 進行状況の数値的な把握
6. **ユーザビリティ**: 直感的な色分けとアイコン使用

