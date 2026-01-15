import {
  QUARTER_FINAL_CODES,
  SEMI_FINAL_CODES,
  THIRD_PLACE_CODES,
  FINAL_CODES,
} from "./constants";
import type { BracketMatch, BracketGroup, BracketStructure } from "./types";

/**
 * トーナメント構造を整理（execution_group基準）
 */
export function organizeBracket(matches: BracketMatch[]): BracketStructure {
  // execution_groupがない場合のフォールバック: 従来のロジック使用
  const hasExecutionGroup = matches.some(
    (m) => m.execution_group !== null && m.execution_group !== undefined
  );

  if (!hasExecutionGroup) {
    // フォールバック: 従来の試合コードベースのグループ化
    const groups: BracketGroup[] = [];

    const quarterFinals = matches.filter((m) =>
      QUARTER_FINAL_CODES.includes(m.match_code)
    );
    const semiFinals = matches.filter((m) =>
      SEMI_FINAL_CODES.includes(m.match_code)
    );
    const thirdPlace = matches.find((m) =>
      THIRD_PLACE_CODES.includes(m.match_code)
    );
    const final = matches.find((m) => FINAL_CODES.includes(m.match_code));

    if (quarterFinals.length > 0) {
      groups.push({
        groupId: 1,
        groupName: "準々決勝",
        matches: quarterFinals.sort((a, b) =>
          a.match_code.localeCompare(b.match_code)
        ),
      });
    }

    if (semiFinals.length > 0) {
      groups.push({
        groupId: 2,
        groupName: "準決勝",
        matches: semiFinals.sort((a, b) =>
          a.match_code.localeCompare(b.match_code)
        ),
      });
    }

    if (thirdPlace) {
      groups.push({
        groupId: 3,
        groupName: "3位決定戦",
        matches: [thirdPlace],
      });
    }

    if (final) {
      groups.push({
        groupId: 4,
        groupName: "決勝",
        matches: [final],
      });
    }

    return { groups, columnCount: groups.length };
  }

  // execution_groupでグループ化
  const groupMap = new Map<number, BracketMatch[]>();

  matches.forEach((match) => {
    const groupId = match.execution_group!;
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, []);
    }
    groupMap.get(groupId)!.push(match);
  });

  // グループ名を決定
  const getGroupName = (
    groupId: number,
    matchCount: number,
    matches: BracketMatch[]
  ): string => {
    // 試合コードから判定
    if (matches.some((m) => QUARTER_FINAL_CODES.includes(m.match_code)))
      return "準々決勝";
    if (matches.some((m) => SEMI_FINAL_CODES.includes(m.match_code)))
      return "準決勝";
    if (matches.some((m) => THIRD_PLACE_CODES.includes(m.match_code)))
      return "3位決定戦";
    if (matches.some((m) => FINAL_CODES.includes(m.match_code))) return "決勝";

    // フォールバック: 試合数から推測
    if (matchCount >= 4) return "準々決勝";
    if (matchCount === 2) return "準決勝";
    if (matchCount === 1) {
      const hasThirdPlace = matches.some((m) =>
        THIRD_PLACE_CODES.includes(m.match_code)
      );
      return hasThirdPlace ? "3位決定戦" : "決勝";
    }
    return `グループ${groupId}`;
  };

  // グループを配列に変換してソート
  const groups: BracketGroup[] = Array.from(groupMap.entries())
    .sort(([a], [b]) => a - b) // execution_groupでソート
    .map(([groupId, matches]) => ({
      groupId,
      groupName: getGroupName(groupId, matches.length, matches),
      matches: matches.sort((a, b) =>
        a.match_code.localeCompare(b.match_code)
      ),
    }));

  return {
    groups,
    columnCount: groups.length,
  };
}
