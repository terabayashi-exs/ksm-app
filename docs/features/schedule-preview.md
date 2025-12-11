# スケジュールプレビューシステム

[← 実装済み機能一覧に戻る](./implemented-features.md)

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

