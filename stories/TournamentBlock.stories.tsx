import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TournamentBlock, MultiBlockBracket } from "@/lib/tournament-bracket";
import type { BracketMatch, SportScoreConfig } from "@/lib/tournament-bracket";

const meta: Meta<typeof TournamentBlock> = {
  title: "Tournament/TournamentBlock",
  component: TournamentBlock,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="p-4 bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TournamentBlock>;

// デフォルトのスポーツ設定（サッカー）
const defaultSportConfig: SportScoreConfig = {
  sport_code: "soccer",
  score_label: "得点",
  score_against_label: "失点",
  difference_label: "得失点差",
  supports_pk: true,
};

// モック試合データ生成ヘルパー
function createMatch(
  id: number,
  team1: string,
  team2: string,
  score1: number,
  score2: number,
  completed = true,
  matchType = "final"
): BracketMatch {
  const winner = score1 > score2 ? `team-${id * 2 - 1}` : `team-${id * 2}`;
  return {
    match_id: id,
    match_code: `M${id}`,
    team1_id: `team-${id * 2 - 1}`,
    team2_id: `team-${id * 2}`,
    team1_tournament_team_id: id * 2 - 1,
    team2_tournament_team_id: id * 2,
    team1_display_name: team1,
    team2_display_name: team2,
    team1_goals: score1,
    team2_goals: score2,
    winner_team_id: completed ? winner : undefined,
    winner_tournament_team_id: completed
      ? score1 > score2
        ? id * 2 - 1
        : id * 2
      : undefined,
    is_draw: false,
    is_walkover: false,
    match_status: completed ? "completed" : "scheduled",
    is_confirmed: completed,
    execution_priority: id,
    match_type: matchType,
    block_name: "決勝トーナメント",
  };
}

// ========================================
// P2: 2チーム（決勝のみ）
// ========================================
const p2Matches: BracketMatch[] = [
  createMatch(1, "FCバルセロナ", "レアル・マドリード", 3, 1),
];

/**
 * P2パターン: 2チーム
 * - 決勝のみ（1試合）
 */
export const P2_TwoTeams: Story = {
  args: {
    blockId: "p2",
    matches: p2Matches,
    sportConfig: defaultSportConfig,
    title: "P2: 2チーム",
  },
};

// ========================================
// P3: 3チーム（1+2配分）
// ========================================
const p3Matches: BracketMatch[] = [
  createMatch(1, "リバプール", "マンC", 2, 1), // 1回戦
  createMatch(2, "FCバルセロナ", "リバプール", 3, 2), // 決勝
];

/**
 * P3パターン: 3チーム
 * - 1回戦（1試合）+ 決勝（1試合）= 2試合
 * - 1チームはシード（不戦勝で決勝へ）
 */
export const P3_ThreeTeams: Story = {
  args: {
    blockId: "p3",
    matches: p3Matches,
    sportConfig: defaultSportConfig,
    title: "P3: 3チーム",
    seedTeams: ["FCバルセロナ"],
  },
};

// ========================================
// P4: 4チーム（2+2配分）
// ========================================
const p4Matches: BracketMatch[] = [
  createMatch(1, "FCバルセロナ", "レアル・マドリード", 3, 1), // 準決勝1
  createMatch(2, "バイエルン", "ドルトムント", 2, 0), // 準決勝2
  createMatch(3, "FCバルセロナ", "バイエルン", 2, 1), // 決勝
];

/**
 * P4パターン: 4チーム
 * - 準決勝（2試合）+ 決勝（1試合）= 3試合
 */
export const P4_FourTeams: Story = {
  args: {
    blockId: "p4",
    matches: p4Matches,
    sportConfig: defaultSportConfig,
    title: "P4: 4チーム",
  },
};

// ========================================
// P5: 5チーム（2+3配分）
// ========================================
const p5Matches: BracketMatch[] = [
  createMatch(1, "ユベントス", "PSG", 1, 2), // 1回戦
  createMatch(2, "FCバルセロナ", "レアル・マドリード", 3, 1), // 準決勝1
  createMatch(3, "バイエルン", "PSG", 2, 1), // 準決勝2
  createMatch(4, "FCバルセロナ", "バイエルン", 2, 0), // 決勝
];

/**
 * P5パターン: 5チーム
 * - 1回戦（1試合）+ 準決勝（2試合）+ 決勝（1試合）= 4試合
 * - 1チームはシード（準決勝へ直接）
 */
export const P5_FiveTeams: Story = {
  args: {
    blockId: "p5",
    matches: p5Matches,
    sportConfig: defaultSportConfig,
    title: "P5: 5チーム",
    seedTeams: ["FCバルセロナ"],
  },
};

// ========================================
// P6: 6チーム（3+3配分）
// ========================================
const p6Matches: BracketMatch[] = [
  createMatch(1, "レアル・マドリード", "アトレティコ", 2, 1), // 1回戦1
  createMatch(2, "ドルトムント", "ライプツィヒ", 3, 2), // 1回戦2
  createMatch(3, "FCバルセロナ", "レアル・マドリード", 3, 1), // 準決勝1
  createMatch(4, "バイエルン", "ドルトムント", 2, 0), // 準決勝2
  createMatch(5, "FCバルセロナ", "バイエルン", 1, 0), // 決勝
];

/**
 * P6パターン: 6チーム
 * - 1回戦（2試合）+ 準決勝（2試合）+ 決勝（1試合）= 5試合
 * - 2チームはシード（準決勝へ直接）
 */
export const P6_SixTeams: Story = {
  args: {
    blockId: "p6",
    matches: p6Matches,
    sportConfig: defaultSportConfig,
    title: "P6: 6チーム",
    seedTeams: ["FCバルセロナ", "バイエルン"],
  },
};

// ========================================
// P7: 7チーム（3+4配分）
// ========================================
const p7Matches: BracketMatch[] = [
  createMatch(1, "レアル・マドリード", "アトレティコ", 2, 1), // 1回戦1
  createMatch(2, "ドルトムント", "ライプツィヒ", 3, 2), // 1回戦2
  createMatch(3, "PSG", "ユベントス", 1, 0), // 1回戦3
  createMatch(4, "FCバルセロナ", "レアル・マドリード", 3, 1), // 準決勝1
  createMatch(5, "バイエルン", "ドルトムント", 2, 0), // 準決勝2
  createMatch(6, "FCバルセロナ", "バイエルン", 2, 1), // 決勝
];

/**
 * P7パターン: 7チーム
 * - 1回戦（3試合）+ 準決勝（2試合）+ 決勝（1試合）= 6試合
 * - 1チームはシード（準決勝へ直接）
 */
export const P7_SevenTeams: Story = {
  args: {
    blockId: "p7",
    matches: p7Matches,
    sportConfig: defaultSportConfig,
    title: "P7: 7チーム",
    seedTeams: ["FCバルセロナ"],
  },
};

// ========================================
// P8: 8チーム（4+4配分）
// ========================================
const p8Matches: BracketMatch[] = [
  createMatch(1, "FCバルセロナ", "レアル・マドリード", 3, 1), // 準々決勝1
  createMatch(2, "マンC", "リバプール", 2, 3), // 準々決勝2
  createMatch(3, "バイエルン", "ドルトムント", 4, 0), // 準々決勝3
  createMatch(4, "PSG", "ユベントス", 1, 2), // 準々決勝4
  createMatch(5, "FCバルセロナ", "リバプール", 2, 1), // 準決勝1
  createMatch(6, "バイエルン", "ユベントス", 3, 2), // 準決勝2
  createMatch(7, "FCバルセロナ", "バイエルン", 2, 1), // 決勝
];

/**
 * P8パターン: 8チーム
 * - 準々決勝（4試合）+ 準決勝（2試合）+ 決勝（1試合）= 7試合
 */
export const P8_EightTeams: Story = {
  args: {
    blockId: "p8",
    matches: p8Matches,
    sportConfig: defaultSportConfig,
    title: "P8: 8チーム",
  },
};

// ========================================
// 未開始パターン
// ========================================
const p4NotStartedMatches: BracketMatch[] = [
  { ...createMatch(1, "チームA", "チームB", 0, 0, false, "semifinal") },
  { ...createMatch(2, "チームC", "チームD", 0, 0, false, "semifinal") },
  {
    match_id: 3,
    match_code: "M3",
    team1_display_name: "未確定",
    team2_display_name: "未確定",
    team1_goals: 0,
    team2_goals: 0,
    is_draw: false,
    is_walkover: false,
    match_status: "scheduled",
    is_confirmed: false,
    execution_priority: 3,
    match_type: "final",
    block_name: "決勝トーナメント",
  },
];

/**
 * 未開始のトーナメント（P4）
 * - 準決勝2試合 + 決勝1試合が未実施
 */
export const P4_NotStarted: Story = {
  args: {
    blockId: "p4-notstarted",
    matches: p4NotStartedMatches,
    sportConfig: defaultSportConfig,
    title: "P4: 未開始",
  },
};

// ========================================
// 2ブロック構成（MultiBlockBracket）
// ========================================

// ブロックA: 8チーム
const blockAMatches: BracketMatch[] = [
  createMatch(101, "チームA1", "チームA2", 3, 1),
  createMatch(102, "チームA3", "チームA4", 2, 3),
  createMatch(103, "チームA5", "チームA6", 4, 0),
  createMatch(104, "チームA7", "チームA8", 1, 2),
  createMatch(105, "チームA1", "チームA4", 2, 1),
  createMatch(106, "チームA5", "チームA8", 3, 2),
  createMatch(107, "チームA1", "チームA5", 2, 1),
];

// ブロックB: 8チーム
const blockBMatches: BracketMatch[] = [
  createMatch(201, "チームB1", "チームB2", 2, 1),
  createMatch(202, "チームB3", "チームB4", 1, 3),
  createMatch(203, "チームB5", "チームB6", 2, 2), // 引き分け想定だが勝者設定
  createMatch(204, "チームB7", "チームB8", 0, 1),
  createMatch(205, "チームB1", "チームB4", 3, 1),
  createMatch(206, "チームB5", "チームB8", 2, 1),
  createMatch(207, "チームB1", "チームB5", 1, 0),
];

// 決勝ブロック: 2チーム（P2パターン）
const finalMatches: BracketMatch[] = [
  createMatch(301, "チームA1", "チームB1", 2, 1),
];

/**
 * 2ブロック構成（16チーム）
 * - ブロックA: 8チーム（P8パターン）
 * - ブロックB: 8チーム（P8パターン）
 * - 決勝: 2チーム（P2パターン）
 */
export const TwoBlocks_16Teams: StoryObj<typeof MultiBlockBracket> = {
  render: () => (
    <MultiBlockBracket
      blocks={[
        { blockId: "A", title: "ブロックA", matches: blockAMatches },
        { blockId: "B", title: "ブロックB", matches: blockBMatches },
      ]}
      finalBlockMatches={finalMatches}
      sportConfig={defaultSportConfig}
    />
  ),
};

// ブロックC, D: 4チームずつ
const blockCMatches: BracketMatch[] = [
  createMatch(301, "チームC1", "チームC2", 2, 1),
  createMatch(302, "チームC3", "チームC4", 1, 3),
  createMatch(303, "チームC1", "チームC4", 2, 0),
];

const blockDMatches: BracketMatch[] = [
  createMatch(401, "チームD1", "チームD2", 3, 2),
  createMatch(402, "チームD3", "チームD4", 0, 1),
  createMatch(403, "チームD1", "チームD4", 1, 0),
];

// 決勝ブロック: 2チーム
const finalMatchesSmall: BracketMatch[] = [
  createMatch(501, "チームC1", "チームD1", 2, 1),
];

/**
 * 2ブロック構成（8チーム: 4+4）
 * - ブロックA: 4チーム（P4パターン）
 * - ブロックB: 4チーム（P4パターン）
 * - 決勝: 2チーム（P2パターン）
 */
export const TwoBlocks_8Teams: StoryObj<typeof MultiBlockBracket> = {
  render: () => (
    <MultiBlockBracket
      blocks={[
        { blockId: "C", title: "ブロックA", matches: blockCMatches },
        { blockId: "D", title: "ブロックB", matches: blockDMatches },
      ]}
      finalBlockMatches={finalMatchesSmall}
      sportConfig={defaultSportConfig}
    />
  ),
};
