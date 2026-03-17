/**
 * 静的ブラケットHTML生成
 * 既存の tournament-bracket のパターン定数を流用し、HTML文字列を出力
 * SVGコネクタ線の描画を含む
 */

import { PATTERNS, getPatternByMatchCount, type PatternConfig } from '@/lib/tournament-bracket/patterns';
import { CARD_HEIGHT, CARD_GAP, MATCH_TYPE_LABELS, ROUND_ORDER } from '@/lib/tournament-bracket/constants';
import type { BracketMatch, SportScoreConfig } from '@/lib/tournament-bracket/types';

// レイアウト定数
const COLUMN_WIDTH = 200;
const COLUMN_GAP = 80;
const HEADER_OFFSET = 30; // ラウンドラベル分のオフセット
const CARD_TOP_PADDING = 10; // match-code badge用のパディング

// MatchCard内のチーム行中央Y座標（カードトップからのオフセット）
const TEAM1_CENTER_Y = CARD_TOP_PADDING + 18; // border + padding(6px) + 行高さ/2
const TEAM2_CENTER_Y = CARD_TOP_PADDING + 42; // team1 + border + padding + 行高さ/2
const SEED_CENTER_Y = 20; // シードカードの中央

// 色定義
const WINNER_COLOR = '#22c55e';
const DEFAULT_COLOR = '#cbd5e1';

// HTML escape utility
function esc(str: string | number | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 個々の試合カードをHTML文字列で生成
 */
function renderMatchCard(match: BracketMatch, _sportConfig?: SportScoreConfig): string {
  const isCompleted = match.is_confirmed || match.match_status === 'completed';
  const hasResult = isCompleted && (match.team1_goals > 0 || match.team2_goals > 0 || match.is_walkover || match.is_draw);

  // 勝者判定
  const team1IsWinner = match.winner_tournament_team_id != null &&
    match.team1_tournament_team_id != null &&
    match.winner_tournament_team_id === match.team1_tournament_team_id;
  const team2IsWinner = match.winner_tournament_team_id != null &&
    match.team2_tournament_team_id != null &&
    match.winner_tournament_team_id === match.team2_tournament_team_id;

  // PK検出（soccer_data または team1_scores配列から）
  let team1Regular = match.team1_goals;
  let team2Regular = match.team2_goals;
  let team1PkScore = '';
  let team2PkScore = '';
  if (match.soccer_data?.is_pk_game) {
    team1Regular = match.soccer_data.regular_goals_for;
    team2Regular = match.soccer_data.regular_goals_against;
    team1PkScore = match.soccer_data.pk_goals_for != null ? `PK${match.soccer_data.pk_goals_for}` : '';
    team2PkScore = match.soccer_data.pk_goals_against != null ? `PK${match.soccer_data.pk_goals_against}` : '';
  } else if (match.team1_scores && match.team1_scores.length >= 5) {
    // 配列から直接PK検出
    const t1Reg = match.team1_scores.slice(0, 4).reduce((s, v) => s + v, 0);
    const t1Pk = match.team1_scores.slice(4).reduce((s, v) => s + v, 0);
    const t2Scores = match.team2_scores || [];
    const t2Reg = t2Scores.slice(0, 4).reduce((s, v) => s + v, 0);
    const t2Pk = t2Scores.slice(4).reduce((s, v) => s + v, 0);
    if (t1Pk > 0 || t2Pk > 0) {
      team1Regular = t1Reg;
      team2Regular = t2Reg;
      team1PkScore = `PK${t1Pk}`;
      team2PkScore = `PK${t2Pk}`;
    }
  }

  // match code badge color
  const matchType = match.match_type || '';
  let codeBadgeClass = 'badge-gray';
  if (matchType === 'final') codeBadgeClass = 'badge-red';
  else if (matchType === 'semifinal') codeBadgeClass = 'badge-purple';
  else if (matchType === 'quarterfinal') codeBadgeClass = 'badge-blue';
  else if (matchType === 'third_place') codeBadgeClass = 'badge-yellow';
  else if (matchType === 'first_round') codeBadgeClass = 'badge-green';

  // Team row class
  const team1Class = hasResult ? (team1IsWinner ? 'winner' : (match.is_draw ? 'draw' : 'loser')) : '';
  const team2Class = hasResult ? (team2IsWinner ? 'winner' : (match.is_draw ? 'draw' : 'loser')) : '';

  // Status text
  let statusText = '';
  if (match.is_confirmed) statusText = '結果確定';
  else if (match.match_status === 'ongoing') statusText = '試合中';
  else if (match.match_status === 'completed') statusText = '試合完了';
  else if (match.match_status === 'cancelled') statusText = '中止';
  else statusText = '未実施';

  // Walkover display
  if (match.is_walkover) {
    const winnerName = team1IsWinner ? match.team1_display_name : match.team2_display_name;
    return `<div class="match-card">
      <span class="match-code ${codeBadgeClass}">${esc(match.match_code)}</span>
      <div class="match-team winner" style="padding:12px 10px;">
        <span class="match-team-name">${esc(winnerName)}</span>
        <span class="badge badge-orange" style="font-size:0.7rem;">不戦勝</span>
      </div>
      <div class="match-status">不戦勝</div>
    </div>`;
  }

  return `<div class="match-card">
    <span class="match-code ${codeBadgeClass}">${esc(match.match_code)}</span>
    <div class="match-team ${team1Class}">
      <span class="match-team-name">${esc(match.team1_display_name) || '---'}</span>
      ${team1IsWinner ? '<span style="font-size:0.7rem;">&#x1F451;</span>' : ''}
      ${hasResult ? `<span class="match-team-score">${team1Regular}</span>${team1PkScore ? `<span class="pk-score">${esc(team1PkScore)}</span>` : ''}` : ''}
    </div>
    <div class="match-team ${team2Class}">
      <span class="match-team-name">${esc(match.team2_display_name) || '---'}</span>
      ${team2IsWinner ? '<span style="font-size:0.7rem;">&#x1F451;</span>' : ''}
      ${hasResult ? `<span class="match-team-score">${team2Regular}</span>${team2PkScore ? `<span class="pk-score">${esc(team2PkScore)}</span>` : ''}` : ''}
    </div>
    <div class="match-status">${esc(statusText)}</div>
  </div>`;
}

/**
 * シードカードを生成
 */
function renderSeedCard(teamName: string): string {
  return `<div class="seed-card">${esc(teamName) || 'シード'}</div>`;
}

// ===== SVGコネクタ線の生成 =====

/** カードのトップY座標を計算 */
function getCardTopY(position: number): number {
  return HEADER_OFFSET + position * (CARD_HEIGHT + CARD_GAP);
}

/** カラムの開始X座標を計算 */
function getColumnStartX(colIndex: number): number {
  return colIndex * (COLUMN_WIDTH + COLUMN_GAP);
}

/** カラムの終了X座標を計算 */
function getColumnEndX(colIndex: number): number {
  return (colIndex + 1) * COLUMN_WIDTH + colIndex * COLUMN_GAP;
}

/** ギャップの中央X座標を計算 */
function getGapMidX(colIndex: number): number {
  return getColumnEndX(colIndex) + COLUMN_GAP / 2;
}

/** 勝者判定 */
function getWinnerIndex(match: BracketMatch): number | null {
  if (!match.is_confirmed) return null;
  if (match.winner_tournament_team_id != null) {
    if (match.winner_tournament_team_id === match.team1_tournament_team_id) return 0;
    if (match.winner_tournament_team_id === match.team2_tournament_team_id) return 1;
  }
  return null;
}

interface SvgLine {
  x1: number; y1: number; x2: number; y2: number;
  color: string;
}

/** SVGコネクタ線を生成 */
function generateConnectorSvg(
  patternConfig: PatternConfig,
  roundMatches: BracketMatch[][],
  _matches: BracketMatch[]
): string {
  const numRounds = patternConfig.rounds.length;
  if (numRounds < 2) return '';

  const lines: SvgLine[] = [];

  // ラウンド間の接続を生成
  for (let roundIdx = 0; roundIdx < numRounds - 1; roundIdx++) {
    const fromRound = patternConfig.rounds[roundIdx];
    const toRound = patternConfig.rounds[roundIdx + 1];
    const fromMatches = roundMatches[roundIdx] || [];
    const toMatches = roundMatches[roundIdx + 1] || [];

    // fromの試合2つ → toの試合1つ（典型的なトーナメントパターン）
    // 各toの試合に対して、fromの対応する試合ペアを接続
    for (let toIdx = 0; toIdx < toRound.matchCount && toIdx < toMatches.length; toIdx++) {
      const toPosition = toRound.positions[toIdx] ?? toIdx;
      const toCardTop = getCardTopY(toPosition);
      const toTeam1Y = toCardTop + TEAM1_CENTER_Y;
      const toTeam2Y = toCardTop + TEAM2_CENTER_Y;
      const toCenterY = (toTeam1Y + toTeam2Y) / 2;

      const targetX = getColumnStartX(roundIdx + 1) - 4;
      const mergeX = targetX - 12;

      // 対応するソース試合を特定
      const sourceStartIdx = toIdx * 2;
      const sourceEndIdx = Math.min(sourceStartIdx + 2, fromRound.matchCount);

      const outputYs: number[] = [];

      // シード接続（roundIdx === 0 の場合のみ）
      if (roundIdx === 0 && patternConfig.seedSlots) {
        for (const slot of patternConfig.seedSlots) {
          // シードがこのtoMatchに接続するかチェック
          const connectMatch = slot.connectTo.match(/R(\d+)M(\d+)/);
          if (connectMatch) {
            const connectRound = parseInt(connectMatch[1], 10);
            const connectMatchIdx = parseInt(connectMatch[2], 10);
            if (connectRound === roundIdx + 1 && connectMatchIdx === toIdx) {
              const seedTop = getCardTopY(slot.position);
              const seedY = seedTop + SEED_CENTER_Y;
              const seedSourceX = getColumnEndX(0) + 4;

              // シードからmergeXまでの水平線
              lines.push({ x1: seedSourceX, y1: seedY, x2: mergeX, y2: seedY, color: WINNER_COLOR });
              outputYs.push(seedY);
            }
          }
        }
      }

      // 試合からの接続
      for (let fromIdx = sourceStartIdx; fromIdx < sourceEndIdx && fromIdx < fromMatches.length; fromIdx++) {
        const fromPosition = fromRound.positions[fromIdx] ?? fromIdx;
        const fromCardTop = getCardTopY(fromPosition);
        const fromTeam1Y = fromCardTop + TEAM1_CENTER_Y;
        const fromTeam2Y = fromCardTop + TEAM2_CENTER_Y;
        const fromCenterY = (fromTeam1Y + fromTeam2Y) / 2;

        const sourceX = getColumnEndX(roundIdx) + 4;
        const midX = getGapMidX(roundIdx);

        const match = fromMatches[fromIdx];
        const winner = match ? getWinnerIndex(match) : null;
        const winColor = winner !== null ? WINNER_COLOR : DEFAULT_COLOR;

        // チーム1からmidXまでの水平線
        lines.push({
          x1: sourceX, y1: fromTeam1Y,
          x2: midX, y2: fromTeam1Y,
          color: winner === 0 ? WINNER_COLOR : DEFAULT_COLOR
        });
        // チーム2からmidXまでの水平線
        lines.push({
          x1: sourceX, y1: fromTeam2Y,
          x2: midX, y2: fromTeam2Y,
          color: winner === 1 ? WINNER_COLOR : DEFAULT_COLOR
        });
        // ブラケット縦線（team1 → center）
        lines.push({
          x1: midX, y1: fromTeam1Y,
          x2: midX, y2: fromCenterY,
          color: winner === 0 ? WINNER_COLOR : DEFAULT_COLOR
        });
        // ブラケット縦線（center → team2）
        lines.push({
          x1: midX, y1: fromCenterY,
          x2: midX, y2: fromTeam2Y,
          color: winner === 1 ? WINNER_COLOR : DEFAULT_COLOR
        });
        // 中央からmergeXまでの水平線
        lines.push({
          x1: midX, y1: fromCenterY,
          x2: mergeX, y2: fromCenterY,
          color: winColor
        });
        outputYs.push(fromCenterY);
      }

      // マージ縦線（全outputYsとtargetYを繋ぐ）
      if (outputYs.length > 0) {
        const hasWinner = outputYs.length > 0; // 接続元がある
        const allYs = [...outputYs, toCenterY];
        const minY = Math.min(...allYs);
        const maxY = Math.max(...allYs);

        if (maxY - minY > 1) {
          lines.push({
            x1: mergeX, y1: minY,
            x2: mergeX, y2: maxY,
            color: hasWinner ? DEFAULT_COLOR : DEFAULT_COLOR
          });
        }

        // ターゲットへの水平線
        lines.push({
          x1: mergeX, y1: toCenterY,
          x2: targetX, y2: toCenterY,
          color: DEFAULT_COLOR
        });
      }
    }

    // fromの試合が1つでtoの試合が1つの場合（シード＋試合→次ラウンド等）
    // 上記のロジックで既にカバー
  }

  // シードからの直接接続（同一ラウンド内のシード→試合接続も対応）
  // 上のループ内で処理済み

  if (lines.length === 0) return '';

  // SVG全体のサイズ計算
  const totalWidth = numRounds * COLUMN_WIDTH + (numRounds - 1) * COLUMN_GAP;
  const allPositions = patternConfig.rounds.flatMap(r => r.positions);
  const seedPositions = patternConfig.seedSlots?.map(s => s.position) || [];
  const maxPos = Math.max(...allPositions, ...seedPositions, 0);
  const totalHeight = getCardTopY(maxPos) + CARD_HEIGHT + 40;

  const svgLines = lines.map(l =>
    `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${l.color}" stroke-width="2" fill="none"/>`
  ).join('\n    ');

  return `<svg class="bracket-svg" width="${totalWidth}" height="${totalHeight}" style="position:absolute;top:0;left:0;pointer-events:none;z-index:1;">
    ${svgLines}
  </svg>`;
}

/**
 * ブラケットブロックをHTML文字列で生成
 * パターン定義に基づいてカラムレイアウトを構築
 */
export function renderStaticBracketBlock(
  blockName: string,
  matches: BracketMatch[],
  sportConfig?: SportScoreConfig
): string {
  if (matches.length === 0) return '';

  // 3位決定戦を分離
  const thirdPlaceMatches = matches.filter(m => m.match_type === 'third_place');
  const mainMatches = matches.filter(m => m.match_type !== 'third_place');

  // パターン検出
  let patternConfig: PatternConfig;
  try {
    patternConfig = PATTERNS[getPatternByMatchCount(mainMatches.length)];
  } catch {
    // fallback: simple list
    return renderMatchList(blockName, matches, sportConfig);
  }

  // match_type でソートしてラウンドに振り分け
  const sortedMatches = [...mainMatches].sort((a, b) => {
    const orderA = ROUND_ORDER[a.match_type] ?? 50;
    const orderB = ROUND_ORDER[b.match_type] ?? 50;
    if (orderA !== orderB) return orderA - orderB;
    return a.execution_priority - b.execution_priority;
  });

  // ラウンドごとに分割
  const roundMatches: BracketMatch[][] = [];
  let matchIdx = 0;
  for (const round of patternConfig.rounds) {
    const roundM: BracketMatch[] = [];
    for (let i = 0; i < round.matchCount && matchIdx < sortedMatches.length; i++) {
      roundM.push(sortedMatches[matchIdx++]);
    }
    roundMatches.push(roundM);
  }

  // ラウンドラベル取得
  const getRoundLabel = (roundIdx: number): string => {
    if (roundMatches[roundIdx]?.[0]) {
      return MATCH_TYPE_LABELS[roundMatches[roundIdx][0].match_type] || `R${roundIdx + 1}`;
    }
    return `R${roundIdx + 1}`;
  };

  const getRoundLabelClass = (roundIdx: number): string => {
    const totalRounds = patternConfig.rounds.length;
    if (roundIdx === totalRounds - 1) return 'badge-red';
    if (roundIdx === 0) return 'badge-green';
    return 'badge-purple';
  };

  // 各カラム生成
  const columns = roundMatches.map((rm, roundIdx) => {
    const positions = patternConfig.rounds[roundIdx]?.positions || [];
    const cards = rm.map((match, i) => {
      const pos = positions[i] ?? i;
      const topPx = pos * (CARD_HEIGHT + CARD_GAP);
      return `<div style="position:absolute;top:${topPx}px;width:100%;padding-top:${CARD_TOP_PADDING}px;">
        ${renderMatchCard(match, sportConfig)}
      </div>`;
    });

    // シードスロット (only in first round)
    let seedHtml = '';
    if (roundIdx === 0 && patternConfig.seedSlots) {
      for (const slot of patternConfig.seedSlots) {
        const topPx = slot.position * (CARD_HEIGHT + CARD_GAP);
        // Find BYE match winner for this seed slot
        const byeMatch = matches.find(m => m.is_walkover || m.is_bye_match);
        const seedTeamName = byeMatch
          ? (byeMatch.team1_display_name || byeMatch.team2_display_name)
          : 'シード';
        seedHtml += `<div style="position:absolute;top:${topPx}px;width:100%;">
          ${renderSeedCard(seedTeamName)}
        </div>`;
      }
    }

    return `<div style="position:relative;min-width:${COLUMN_WIDTH}px;min-height:${getColumnHeight(positions)}px;z-index:2;">
      <div class="round-label ${getRoundLabelClass(roundIdx)}">${esc(getRoundLabel(roundIdx))}</div>
      ${seedHtml}
      ${cards.join('\n')}
    </div>`;
  });

  // SVGコネクタ線を生成
  const svgHtml = generateConnectorSvg(patternConfig, roundMatches, matches);

  // 3位決定戦
  let thirdPlaceHtml = '';
  if (thirdPlaceMatches.length > 0) {
    thirdPlaceHtml = `<div class="card mt-2">
      <div class="card-header"><span class="badge badge-yellow">3位決定戦</span></div>
      <div class="card-body">${thirdPlaceMatches.map(m => renderMatchCard(m, sportConfig)).join('')}</div>
    </div>`;
  }

  const blockBadgeClass = getBlockBadgeClass(blockName);

  return `<div class="bracket-block">
    <div class="card">
      <div class="card-header">
        <span class="badge ${blockBadgeClass}">${esc(blockName)}</span>
      </div>
      <div class="card-body">
        <div class="bracket-container">
          <div class="bracket-grid" style="position:relative;">
            ${svgHtml}
            ${columns.join('\n')}
          </div>
        </div>
      </div>
    </div>
    ${thirdPlaceHtml}
  </div>`;
}

/**
 * 簡易リスト表示（パターンに収まらない場合のフォールバック）
 */
function renderMatchList(blockName: string, matches: BracketMatch[], sportConfig?: SportScoreConfig): string {
  const blockBadgeClass = getBlockBadgeClass(blockName);
  const cards = matches.map(m => renderMatchCard(m, sportConfig)).join('\n');
  return `<div class="card">
    <div class="card-header"><span class="badge ${blockBadgeClass}">${esc(blockName)}</span></div>
    <div class="card-body" style="display:flex;flex-wrap:wrap;gap:12px;">
      ${cards}
    </div>
  </div>`;
}

function getColumnHeight(positions: number[]): number {
  if (positions.length === 0) return CARD_HEIGHT;
  const maxPos = Math.max(...positions);
  return (maxPos + 1) * (CARD_HEIGHT + CARD_GAP) + 40;
}

function getBlockBadgeClass(blockName: string): string {
  const name = blockName.toUpperCase();
  if (name === 'A' || name.includes('A')) return 'bg-block-a';
  if (name === 'B' || name.includes('B')) return 'bg-block-b';
  if (name === 'C' || name.includes('C')) return 'bg-block-c';
  if (name === 'D' || name.includes('D')) return 'bg-block-d';
  if (name.includes('決勝') || name.includes('FINAL')) return 'bg-block-final';
  return 'badge-gray';
}

/**
 * 複数ブロックの完全なブラケットHTMLを生成
 * _unified ブロックの場合は match_code のプレフィックスで分割
 */
export function renderStaticBracket(
  bracketData: Record<string, BracketMatch[]>,
  sportConfig?: SportScoreConfig
): string {
  const blocks = Object.entries(bracketData);
  if (blocks.length === 0) return '<p class="text-muted">ブラケットデータがありません</p>';

  // _unified ブロックを分割
  const expandedBlocks: [string, BracketMatch[]][] = [];
  for (const [blockName, matches] of blocks) {
    if (blockName.endsWith('_unified')) {
      // match_code の先頭文字でサブブロックに分割 (A1→A, B1→B等)
      const subBlocks = new Map<string, BracketMatch[]>();
      for (const m of matches) {
        const prefix = m.match_code.match(/^([A-Z])/)?.[1] || blockName;
        if (!subBlocks.has(prefix)) subBlocks.set(prefix, []);
        subBlocks.get(prefix)!.push(m);
      }
      // ソートして追加
      const sorted = [...subBlocks.entries()].sort(([a], [b]) => a.localeCompare(b));
      for (const [subName, subMatches] of sorted) {
        expandedBlocks.push([subName, subMatches]);
      }
    } else {
      expandedBlocks.push([blockName, matches]);
    }
  }

  return expandedBlocks.map(([blockName, matches]) =>
    renderStaticBracketBlock(blockName, matches, sportConfig)
  ).join('\n');
}
