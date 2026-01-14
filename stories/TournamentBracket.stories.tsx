import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TournamentBracket from "@/components/features/tournament/TournamentBracket";
import { handlers } from "./mocks/handlers";

const meta: Meta<typeof TournamentBracket> = {
  title: "Tournament/TournamentBracket",
  component: TournamentBracket,
  parameters: {
    layout: "fullscreen",
    // MSW ハンドラーを設定
    msw: {
      handlers,
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TournamentBracket>;

/**
 * 完了済み8チームトーナメント
 * - 準々決勝、準決勝、3位決定戦、決勝がすべて完了
 * - 勝者と敗者が明確に表示される
 */
export const Completed8Teams: Story = {
  args: {
    tournamentId: 1,
  },
};

/**
 * 進行中のトーナメント
 * - 準々決勝、準決勝は完了
 * - 決勝が試合中、3位決定戦が未実施
 */
export const Ongoing: Story = {
  args: {
    tournamentId: 2,
  },
};

/**
 * BYE（不戦勝）を含むトーナメント
 * - チーム数が2の累乗でない場合に発生
 * - M1, M3 が BYE として表示される
 */
export const WithBye: Story = {
  args: {
    tournamentId: 3,
  },
};

/**
 * 不戦勝（チーム辞退）を含むトーナメント
 * - チームが大会辞退した場合に発生
 * - M4 で不戦勝が表示される
 */
export const WithWalkover: Story = {
  args: {
    tournamentId: 4,
  },
};

/**
 * PK戦を含むトーナメント
 * - サッカー等でPK戦が発生した場合
 * - M6 でPK戦の結果が表示される（例: 3-3 PK: 3-2）
 */
export const WithPKShootout: Story = {
  args: {
    tournamentId: 5,
  },
};

/**
 * 未開始のトーナメント
 * - すべての試合が scheduled 状態
 * - チーム名とスコアが初期値で表示される
 */
export const NotStarted: Story = {
  args: {
    tournamentId: 6,
  },
};

/**
 * 存在しないトーナメント（404エラー）
 * - トーナメントが存在しない場合のエラー表示
 */
export const NotFound: Story = {
  args: {
    tournamentId: 999,
  },
};

/**
 * サーバーエラー（500エラー）
 * - API呼び出しでエラーが発生した場合の表示
 */
export const ServerError: Story = {
  args: {
    tournamentId: 0,
  },
};
