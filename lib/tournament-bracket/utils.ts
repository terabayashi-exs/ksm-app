import {
  QUARTER_FINAL_CODES,
  SEMI_FINAL_CODES,
  THIRD_PLACE_CODES,
  FINAL_CODES,
  PLACEMENT_MATCH_PATTERN,
} from "./constants";
import type { BracketMatch, BracketGroup, BracketStructure } from "./types";

/**
 * match_codeを自然順でソートする比較関数
 * "T1", "T2", ... "T12" → プレフィックス文字順、次に数値順
 */
export function compareMatchCode(a: string, b: string): number {
  const parseCode = (code: string) => {
    const match = code.match(/^([A-Z]+)(\d+)$/);
    if (match) return { prefix: match[1], num: parseInt(match[2], 10) };
    return { prefix: code, num: 0 };
  };
  const pa = parseCode(a);
  const pb = parseCode(b);
  if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
  return pa.num - pb.num;
}

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
          compareMatchCode(a.match_code, b.match_code)
        ),
      });
    }

    if (semiFinals.length > 0) {
      groups.push({
        groupId: 2,
        groupName: "準決勝",
        matches: semiFinals.sort((a, b) =>
          compareMatchCode(a.match_code, b.match_code)
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
        compareMatchCode(a.match_code, b.match_code)
      ),
    }));

  return {
    groups,
    columnCount: groups.length,
  };
}

/**
 * match_type ベースで試合を整理（可変チーム数対応）
 *
 * TODO: t_match_blocks 作成時に m_match_templates から match_type を引き継ぐように修正後:
 *       1. QUARTER_FINAL_CODES 等のハードコード定数への依存を削除
 *       2. ROUND_ORDER と MATCH_TYPE_LABELS を使用して match_type ベースで処理
 *       3. 3位決定戦の判定も THIRD_PLACE_MATCH_TYPE を使用
 */
export function organizeMatchesByMatchType(matches: BracketMatch[]): {
  mainMatches: BracketMatch[];
  placementMatches: { position: number; match: BracketMatch }[];
  loserSemifinalMatches: BracketMatch[];
  roundLabels: string[];
} {
  // 順位決定戦（3位・5位・7位など）を分離
  const placementMatches: { position: number; match: BracketMatch }[] = [];
  const placementMatchIds = new Set<number>();

  // Step 1: position_noteで順位決定戦を抽出
  matches.forEach(m => {
    if (m.position_note) {
      const noteMatch = m.position_note.match(PLACEMENT_MATCH_PATTERN);
      if (noteMatch) {
        placementMatches.push({ position: parseInt(noteMatch[1], 10), match: m });
        placementMatchIds.add(m.match_id);
        return;
      }
    }
    // フォールバック: THIRD_PLACE_CODES（M7, T7）にマッチ → 3位決定戦
    // ただしposition_noteが別の値（"準決勝"等）で設定されている場合はスキップ
    if (THIRD_PLACE_CODES.includes(m.match_code) && !m.position_note && !placementMatchIds.has(m.match_id)) {
      placementMatches.push({ position: 3, match: m });
      placementMatchIds.add(m.match_id);
    }
  });

  // Step 2: 敗者側の試合を分離（両ソースが_loserの試合で、
  // その勝者/敗者が順位決定戦に進む試合 = 下位順位決定の準決勝）
  // 例: T6(T1_loser vs T2_loser) → 勝者がT10(5位決定戦)、敗者がT9(7位決定戦)
  const placementMatchSources = new Set<string>();
  placementMatches.forEach(({ match: m }) => {
    // "T6_winner" → "T6", "T6_loser" → "T6"
    if (m.team1_source) {
      const srcMatch = m.team1_source.match(/^([A-Z]\d+)_(winner|loser)$/);
      if (srcMatch) placementMatchSources.add(srcMatch[1]);
    }
    if (m.team2_source) {
      const srcMatch = m.team2_source.match(/^([A-Z]\d+)_(winner|loser)$/);
      if (srcMatch) placementMatchSources.add(srcMatch[1]);
    }
  });

  // 両方のソースが_loserで、かつ順位決定戦のソースになっている試合を分離
  const loserSemifinalMatches: BracketMatch[] = [];
  matches.forEach(m => {
    if (placementMatchIds.has(m.match_id)) return;
    const isLoserMatch = m.team1_source && m.team2_source &&
      /_loser$/.test(m.team1_source) && /_loser$/.test(m.team2_source);
    if (isLoserMatch && placementMatchSources.has(m.match_code)) {
      loserSemifinalMatches.push(m);
      placementMatchIds.add(m.match_id);
    }
  });
  loserSemifinalMatches.sort((a, b) => compareMatchCode(a.match_code, b.match_code));

  // position昇順でソート
  placementMatches.sort((a, b) => a.position - b.position);

  // メイン試合（順位決定戦・敗者側試合以外）を抽出
  const mainMatches = matches.filter(m => !placementMatchIds.has(m.match_id));

  // ラウンドラベルを生成
  const roundLabels: string[] = [];

  // 試合コードベースで判定
  const hasQuarterFinal = mainMatches.some(m => QUARTER_FINAL_CODES.includes(m.match_code));
  const hasSemiFinal = mainMatches.some(m => SEMI_FINAL_CODES.includes(m.match_code));
  const hasFinal = mainMatches.some(m => FINAL_CODES.includes(m.match_code));

  if (hasQuarterFinal) roundLabels.push("準々決勝");
  if (hasSemiFinal) roundLabels.push("準決勝");
  if (hasFinal) roundLabels.push("決勝");

  // 試合を match_code でソート
  const sortedMainMatches = [...mainMatches].sort((a, b) =>
    compareMatchCode(a.match_code, b.match_code)
  );

  return {
    mainMatches: sortedMainMatches,
    placementMatches,
    loserSemifinalMatches,
    roundLabels,
  };
}
