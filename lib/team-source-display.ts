/**
 * team_source 文字列をユーザー向け日本語表示に変換
 */
export function formatTeamSourceDisplay(source: string): string {
  // BEST パターン (例: BEST_3_1 → 全ブロック3位中ベスト1)
  const bestMatch = source.match(/^BEST_(\d+)_(\d+)$/);
  if (bestMatch) {
    return `全ブロック${bestMatch[1]}位中ベスト${bestMatch[2]}`;
  }
  // ブロック順位パターン (例: A_1 → Aブロック1位)
  const blockMatch = source.match(/^([A-Z])_(\d+)$/);
  if (blockMatch) {
    return `${blockMatch[1]}ブロック${blockMatch[2]}位`;
  }
  // 試合勝者パターン (例: T1_winner → T1の勝者)
  const winnerMatch = source.match(/^(.+)_winner$/);
  if (winnerMatch) {
    return `${winnerMatch[1]}の勝者`;
  }
  // 試合敗者パターン (例: T1_loser → T1の敗者)
  const loserMatch = source.match(/^(.+)_loser$/);
  if (loserMatch) {
    return `${loserMatch[1]}の敗者`;
  }
  return source;
}
