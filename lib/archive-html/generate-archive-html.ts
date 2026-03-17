/**
 * アーカイブ用静的HTML生成メイン関数
 * 全タブ内容を1つのHTMLに含め、CSS-onlyタブで切替
 */

import { ARCHIVE_CSS, generatePhaseTabCss } from './archive-styles';
import { renderStaticBracket } from './static-bracket';
import type { BracketMatch, SportScoreConfig } from '@/lib/tournament-bracket/types';

// ===== Types =====
interface TournamentData {
  tournament_id: number;
  tournament_name: string;
  team_count?: number;
  court_count?: number;
  match_duration_minutes?: number;
  break_duration_minutes?: number;
  tournament_dates?: Record<string, string> | string;
  recruitment_start_date?: string;
  recruitment_end_date?: string;
  format_name?: string;
  venue_name?: string;
  status?: string;
  [key: string]: unknown;
}

interface TeamData {
  team_id: string;
  team_name: string;
  team_omission?: string;
  assigned_block?: string;
  block_position?: number;
  withdrawal_status?: string;
  player_count?: number;
  players?: Array<{ player_name: string; jersey_number?: number }>;
}

interface MatchData {
  match_id: number;
  match_code: string;
  block_name: string;
  block_order?: number;
  phase: string;
  match_type?: string;
  tournament_date: string;
  match_number: number;
  start_time?: string;
  court_number?: number;
  court_name?: string;
  venue_name?: string;
  venue_id?: number;
  matchday?: number;
  team1_display_name: string;
  team2_display_name: string;
  team1_tournament_team_id?: number;
  team2_tournament_team_id?: number;
  team1_goals: number;
  team2_goals: number;
  team1_scores?: string;
  team2_scores?: string;
  team1_pk_goals?: number | null;
  team2_pk_goals?: number | null;
  has_result: number;
  winner_team_id?: string;
  is_draw: number;
  is_walkover: number;
  match_status: string;
  display_round_name?: string;
  remarks?: string;
}

interface StandingData {
  block_name: string;
  phase: string;
  display_round_name?: string;
  format_type?: string;
  team_rankings?: string | TeamRanking[];
  remarks?: string;
}

interface TeamRanking {
  team_id?: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points?: number;
  matches_played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goals_for?: number;
  goals_against?: number;
  goal_difference?: number;
}

interface ResultData {
  match_code: string;
  team1_name: string;
  team2_name: string;
  team1_scores?: string;
  team2_scores?: string;
  is_draw?: number;
  is_walkover?: number;
  block_name: string;
}

interface FileData {
  file_id: number;
  file_title: string;
  file_description?: string;
  original_filename: string;
  blob_url: string;
  external_url?: string;
  link_type: string;
  file_size: number;
}

interface ArchiveHtmlInput {
  tournament: TournamentData;
  teams: TeamData[];
  matches: MatchData[];
  standings: StandingData[];
  results: ResultData[];
  bracketData?: Record<string, BracketMatch[]>;
  sportConfig?: SportScoreConfig;
  files?: FileData[];
  metadata: {
    total_teams: number;
    total_matches: number;
    completed_matches: number;
    blocks_count: number;
    [key: string]: unknown;
  };
  archivedAt: string;
  archivedBy: string;
}

// ===== Helpers =====
function esc(str: string | number | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateJa(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return String(dateStr);
  }
}

function formatTime(time: string | null | undefined): string {
  if (!time) return '--:--';
  return time.substring(0, 5);
}

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return '-';
  }
}

function getBlockBadgeClass(blockName: string): string {
  if (blockName === 'A') return 'bg-block-a';
  if (blockName === 'B') return 'bg-block-b';
  if (blockName === 'C') return 'bg-block-c';
  if (blockName === 'D') return 'bg-block-d';
  if (blockName.includes('決勝') || blockName.toLowerCase().includes('final')) return 'bg-block-final';
  return 'badge-gray';
}

function parseRankings(data: string | TeamRanking[] | undefined): TeamRanking[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function isLeagueStandings(block: StandingData, rankings: TeamRanking[]): boolean {
  if (block.format_type) return block.format_type === 'league';
  if (rankings.length > 0 && rankings[0].matches_played != null && rankings[0].matches_played > 0) return true;
  return block.phase === 'preliminary' || block.phase?.includes('予選') || block.phase?.includes('リーグ');
}

function parseTotalScore(scores: string | null | undefined): number {
  if (!scores) return 0;
  return scores.split(',').reduce((sum, s) => sum + (parseInt(s.trim()) || 0), 0);
}

/** PK戦スコアを分離する（サッカー: 5要素以上で最後がPK） */
function parsePkScore(scores: string | null | undefined): { regular: number; pk: number; hasPk: boolean } {
  if (!scores) return { regular: 0, pk: 0, hasPk: false };
  const parts = scores.split(',').map(s => parseInt(s.trim()) || 0);
  if (parts.length >= 5) {
    const regular = parts.slice(0, 4).reduce((s, v) => s + v, 0);
    const pk = parts.slice(4).reduce((s, v) => s + v, 0);
    if (pk > 0) return { regular, pk, hasPk: true };
    return { regular, pk: 0, hasPk: false };
  }
  return { regular: parts.reduce((s, v) => s + v, 0), pk: 0, hasPk: false };
}

/** スコア表示HTML（PK対応） */
function formatScoreHtml(m: { team1_scores?: string; team2_scores?: string; team1_goals: number; team2_goals: number; team1_pk_goals?: number | null; team2_pk_goals?: number | null }): string {
  // 1. team1_pk_goals/team2_pk_goals が利用可能な場合（ライブ版と同じロジック）
  const hasPkGoals = (m.team1_pk_goals != null && m.team1_pk_goals > 0) || (m.team2_pk_goals != null && m.team2_pk_goals > 0);
  if (hasPkGoals) {
    // team1_goals/team2_goalsはPKを除いた通常スコア（calculateDisplayScoreで分離済み）
    return `${Math.floor(m.team1_goals)} - ${Math.floor(m.team2_goals)} <span class="text-xs text-muted">(PK ${m.team1_pk_goals || 0}-${m.team2_pk_goals || 0})</span>`;
  }
  // 2. team1_scores文字列からPK検出（フォールバック）
  const pk1 = parsePkScore(m.team1_scores);
  const pk2 = parsePkScore(m.team2_scores);
  if (pk1.hasPk || pk2.hasPk) {
    return `${pk1.regular} - ${pk2.regular} <span class="text-xs text-muted">(PK ${pk1.pk}-${pk2.pk})</span>`;
  }
  return `${Math.floor(m.team1_goals)} - ${Math.floor(m.team2_goals)}`;
}

// ===== File Section =====
function generateFilesSection(files?: FileData[]): string {
  if (!files || files.length === 0) return '';

  const fileItems = files.map(f => {
    const url = f.link_type === 'external' ? f.external_url : f.blob_url;
    const sizeStr = f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : '';
    return `<div class="team-card">
      <h3><a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${esc(f.file_title || f.original_filename)}</a></h3>
      ${f.file_description ? `<p class="text-sm text-gray mt-2">${esc(f.file_description)}</p>` : ''}
      <p class="text-xs text-muted mt-2">${esc(f.original_filename)}${sizeStr ? ` (${sizeStr})` : ''}</p>
    </div>`;
  }).join('');

  return `<div class="card">
    <div class="card-header">&#x1F4CE; 添付ファイル</div>
    <div class="card-body">
      <div class="team-grid">${fileItems}</div>
    </div>
  </div>`;
}

// ===== Tab Content Generators =====

function generateOverviewTab(data: ArchiveHtmlInput): string {
  const t = data.tournament;

  // Parse tournament dates
  let datesHtml = '';
  let dates: Record<string, string> = {};
  if (t.tournament_dates) {
    if (typeof t.tournament_dates === 'string') {
      try { dates = JSON.parse(t.tournament_dates); } catch { /* ignore */ }
    } else {
      dates = t.tournament_dates;
    }
    const dateEntries = Object.entries(dates).sort(([a], [b]) => a.localeCompare(b));
    if (dateEntries.length > 0) {
      datesHtml = `<div class="card">
        <div class="card-header">&#x1F4C5; 開催日程</div>
        <div class="card-body">
          <div class="stats-grid">
            ${dateEntries.map(([key, val]) => `<div class="stat-item">
              <div class="stat-value text-blue">${esc(key)}</div>
              <div class="stat-label">${esc(formatDateJa(val as string))}</div>
            </div>`).join('')}
          </div>
        </div>
      </div>`;
    }
  }

  return `<div class="panel panel-overview">
    <!-- 基本情報 -->
    <div class="card">
      <div class="card-header">&#x1F3C6; 大会基本情報</div>
      <div class="card-body">
        <div class="info-grid">
          <div class="info-item">
            <div class="label">大会名</div>
            <div class="value">${esc(t.tournament_name)}</div>
          </div>
          <div class="info-item">
            <div class="label">フォーマット</div>
            <div class="value">${esc(t.format_name)}</div>
          </div>
          <div class="info-item">
            <div class="label">会場</div>
            <div class="value">${esc(t.venue_name)}</div>
          </div>
          <div class="info-item">
            <div class="label">参加チーム数</div>
            <div class="value">${data.metadata.total_teams}チーム</div>
          </div>
          ${t.court_count ? `<div class="info-item">
            <div class="label">コート数</div>
            <div class="value">${t.court_count}面</div>
          </div>` : ''}
          ${t.match_duration_minutes ? `<div class="info-item">
            <div class="label">試合時間</div>
            <div class="value">${t.match_duration_minutes}分</div>
          </div>` : ''}
          ${t.break_duration_minutes ? `<div class="info-item">
            <div class="label">休憩時間</div>
            <div class="value">${t.break_duration_minutes}分</div>
          </div>` : ''}
        </div>
      </div>
    </div>

    ${datesHtml}

    <!-- 統計サマリー -->
    <div class="card">
      <div class="card-header">&#x1F4CA; 大会統計</div>
      <div class="card-body">
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value text-blue">${data.metadata.total_teams}</div>
            <div class="stat-label">チーム数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value text-green">${data.metadata.total_matches}</div>
            <div class="stat-label">総試合数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value text-purple">${data.metadata.completed_matches}</div>
            <div class="stat-label">完了試合</div>
          </div>
          <div class="stat-item">
            <div class="stat-value text-orange">${data.metadata.blocks_count}</div>
            <div class="stat-label">ブロック数</div>
          </div>
        </div>
      </div>
    </div>

    ${t.recruitment_start_date || t.recruitment_end_date ? `<div class="card">
      <div class="card-header">&#x1F4E2; 募集期間</div>
      <div class="card-body">
        <div class="info-grid">
          <div class="info-item">
            <div class="label">募集開始</div>
            <div class="value">${esc(formatDateJa(t.recruitment_start_date))}</div>
          </div>
          <div class="info-item">
            <div class="label">募集終了</div>
            <div class="value">${esc(formatDateJa(t.recruitment_end_date))}</div>
          </div>
        </div>
      </div>
    </div>` : ''}

    ${generateFilesSection(data.files)}
  </div>`;
}

function generateScheduleTab(data: ArchiveHtmlInput): string {
  // 不戦勝試合を除外
  const matches = data.matches.filter(m => !m.is_walkover);
  if (matches.length === 0) return '<div class="panel panel-schedule"><p class="text-muted">試合データがありません</p></div>';

  // リーグ戦モード判定（matchdayが設定されている試合があるか）
  const isLeagueMode = matches.some(m => m.matchday != null && m.matchday > 0);

  // 試合結果HTML生成
  const getResultHtml = (m: MatchData): string => {
    if (!m.has_result) {
      const statusMap: Record<string, string> = {
        ongoing: '<span class="text-orange">試合中</span>',
        completed: '<span class="text-purple">試合完了</span>',
        cancelled: '<span class="text-red">中止</span>',
      };
      return statusMap[m.match_status] || '<span class="text-muted">未実施</span>';
    }
    if (m.is_walkover) return `<span class="text-orange">不戦勝 ${Math.floor(m.team1_goals)} - ${Math.floor(m.team2_goals)}</span>`;
    return `<span class="text-blue font-bold">${formatScoreHtml(m)}</span>`;
  };

  // 試合行HTML生成（共通）
  const renderMatchRow = (m: MatchData, showCourt: boolean, showDate: boolean): string => {
    return `<tr>
      ${showDate ? `<td style="white-space:nowrap;vertical-align:top;">${esc(formatShortDate(m.tournament_date))}<br>${esc(formatTime(m.start_time))}</td>` : `<td style="white-space:nowrap;">${esc(formatTime(m.start_time))}</td>`}
      <td style="white-space:nowrap;">${esc(m.match_code)}</td>
      <td>
        <div>${esc(m.team1_display_name) || '調整中'}</div>
        <div class="text-xs text-muted">vs</div>
        <div>${esc(m.team2_display_name) || '調整中'}</div>
      </td>
      <td style="text-align:right;white-space:nowrap;">${getResultHtml(m)}</td>
      ${showCourt ? `<td style="text-align:right;white-space:nowrap;">${m.court_name || (m.court_number ? `コート${m.court_number}` : '-')}</td>` : ''}
    </tr>`;
  };

  // 試合テーブルHTML生成（共通）
  const renderMatchTable = (tableMatches: MatchData[], showCourt: boolean, showDate: boolean): string => {
    const sorted = [...tableMatches].sort((a, b) => {
      if (showDate) {
        const dateComp = (a.tournament_date || '').localeCompare(b.tournament_date || '');
        if (dateComp !== 0) return dateComp;
      }
      const timeA = a.start_time || '99:99';
      const timeB = b.start_time || '99:99';
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      return (a.match_code || '').localeCompare(b.match_code || '', undefined, { numeric: true });
    });
    const rows = sorted.map(m => renderMatchRow(m, showCourt, showDate)).join('');
    return `<div class="overflow-x-auto">
      <table class="data-table">
        <thead><tr>
          <th>${showDate ? '日時' : '時間'}</th>
          <th>試合</th>
          <th>対戦</th>
          <th style="text-align:right;">結果</th>
          ${showCourt ? '<th style="text-align:right;">コート</th>' : ''}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  };

  let sections: string;

  if (isLeagueMode) {
    // === 節別表示（リーグ戦モード） ===
    const byMatchday: Record<number, MatchData[]> = {};
    for (const m of matches) {
      const md = m.matchday ?? 0;
      if (!byMatchday[md]) byMatchday[md] = [];
      byMatchday[md].push(m);
    }
    const sortedMatchdays = Object.keys(byMatchday).map(Number).sort((a, b) => a - b);

    sections = sortedMatchdays.map(md => {
      const mdMatches = byMatchday[md];
      return `<div class="card">
        <div class="card-header">&#x1F3C6; 第${md}節 <span class="text-muted text-sm" style="margin-left:8px;">${mdMatches.length}試合</span></div>
        <div class="card-body">${renderMatchTable(mdMatches, true, true)}</div>
      </div>`;
    }).join('');
  } else {
    // === 日付→コート別表示（通常モード） ===
    const byDate: Record<string, MatchData[]> = {};
    for (const m of matches) {
      const dateKey = m.tournament_date || '日付不明';
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(m);
    }
    const sortedDates = Object.keys(byDate).sort();

    sections = sortedDates.map(dateKey => {
      const dateMatches = byDate[dateKey];

      // コートごとにグループ化
      const byCourt: Record<string, MatchData[]> = {};
      for (const m of dateMatches) {
        const courtKey = m.court_name || (m.court_number ? `コート${m.court_number}` : '');
        if (!byCourt[courtKey]) byCourt[courtKey] = [];
        byCourt[courtKey].push(m);
      }

      const courtKeys = Object.keys(byCourt).sort((a, b) => {
        if (!a) return 1;
        if (!b) return -1;
        return Math.min(...byCourt[a].map(m => m.match_id)) - Math.min(...byCourt[b].map(m => m.match_id));
      });
      const hasMultipleCourts = courtKeys.length > 1 || (courtKeys.length === 1 && courtKeys[0] !== '');

      const courtSections = courtKeys.map(courtKey => {
        const courtMatches = byCourt[courtKey];
        // コートヘッダー（会場名 + コート名）
        let courtHeaderHtml = '';
        if (hasMultipleCourts && courtKey) {
          const venueNames = [...new Set(courtMatches.map(m => m.venue_name).filter(Boolean))];
          const venueHtml = venueNames.length > 0 ? `<div class="text-sm text-muted" style="margin-bottom:2px;">&#x1F4CD; ${venueNames.map(v => esc(v!)).join(', ')}</div>` : '';
          courtHeaderHtml = `<div style="padding:8px 0 4px;">
            ${venueHtml}
            <div class="font-bold text-sm">${esc(courtKey)} <span class="text-muted" style="font-weight:normal;">(${courtMatches.length}試合)</span></div>
          </div>`;
        }

        return `${courtHeaderHtml}${renderMatchTable(courtMatches, !hasMultipleCourts, false)}`;
      }).join('');

      return `<div class="card">
        <div class="card-header">&#x1F4C5; 開催日: ${esc(formatDateJa(dateKey))} <span class="text-muted text-sm" style="margin-left:8px;">${dateMatches.length}試合</span></div>
        <div class="card-body">${courtSections}</div>
      </div>`;
    }).join('');
  }

  const sortedDates = [...new Set(matches.map(m => m.tournament_date))];
  return `<div class="panel panel-schedule">
    <div class="card mb-4">
      <div class="card-body">
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value text-blue">${data.metadata.total_matches}</div>
            <div class="stat-label">総試合数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value text-green">${sortedDates.length}</div>
            <div class="stat-label">開催日数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value text-purple">${data.metadata.completed_matches}</div>
            <div class="stat-label">完了試合</div>
          </div>
        </div>
      </div>
    </div>
    ${sections}
  </div>`;
}

function generatePhaseTab(
  phaseId: string,
  _phaseName: string,
  bracketData: Record<string, BracketMatch[]>,
  matches: MatchData[],
  teams: TeamData[],
  _standings: StandingData[],
  results: ResultData[],
  sportConfig?: SportScoreConfig
): string {
  // Check if this phase has bracket data
  const hasBracketData = Object.keys(bracketData).length > 0;

  // Filter matches/results for this phase
  const phaseMatches = matches.filter(m => m.phase === phaseId);
  const phaseBlocks = [...new Set(phaseMatches.map(m => m.block_name))];
  const phaseResults = results.filter(r => phaseBlocks.includes(r.block_name));

  // Bracket section
  let bracketHtml = '';
  if (hasBracketData) {
    bracketHtml = `<div class="mb-4">
      <h3 style="font-size:1rem;font-weight:600;margin-bottom:12px;">&#x1F3AF; トーナメント表</h3>
      ${renderStaticBracket(bracketData, sportConfig)}
    </div>`;
  }

  // Results matrix for this phase
  let matrixHtml = '';
  if (phaseResults.length > 0) {
    matrixHtml = generateResultsMatrix(phaseResults, teams.filter(t => phaseBlocks.includes(t.assigned_block || '')));
  }

  return `<div class="panel panel-phase-${esc(phaseId)}">
    ${bracketHtml}
    ${matrixHtml ? `<div class="mb-4">
      <h3 style="font-size:1rem;font-weight:600;margin-bottom:12px;">&#x1F4CB; 戦績表</h3>
      ${matrixHtml}
    </div>` : ''}
  </div>`;
}

function generateResultsMatrix(results: ResultData[], teams: TeamData[]): string {
  // Group by block
  const byBlock: Record<string, ResultData[]> = {};
  for (const r of results) {
    if (!byBlock[r.block_name]) byBlock[r.block_name] = [];
    byBlock[r.block_name].push(r);
  }

  return Object.entries(byBlock).map(([blockName, blockResults]) => {
    const blockTeams = teams.filter(t => t.assigned_block === blockName);
    if (blockTeams.length === 0) return '';

    // Build matrix
    const matrix: Record<string, Record<string, { cls: string; text: string }>> = {};
    for (const t1 of blockTeams) {
      matrix[t1.team_name] = {};
    }

    for (const r of blockResults) {
      const t1 = r.team1_name;
      const t2 = r.team2_name;
      // PK分離対応：PKを含まない通常スコアで表示
      const pk1 = parsePkScore(r.team1_scores);
      const pk2 = parsePkScore(r.team2_scores);
      const g1 = pk1.regular;
      const g2 = pk2.regular;
      const pkSuffix = (pk1.hasPk || pk2.hasPk) ? `\n(PK ${pk1.pk}-${pk2.pk})` : '';
      const pkSuffixReverse = (pk1.hasPk || pk2.hasPk) ? `\n(PK ${pk2.pk}-${pk1.pk})` : '';

      if (r.is_walkover) {
        if (matrix[t1]) matrix[t1][t2] = { cls: '', text: '不戦勝' };
        if (matrix[t2]) matrix[t2][t1] = { cls: '', text: '不戦敗' };
      } else if (r.is_draw) {
        if (matrix[t1]) matrix[t1][t2] = { cls: '', text: `△\n${g1}-${g2}${pkSuffix}` };
        if (matrix[t2]) matrix[t2][t1] = { cls: '', text: `△\n${g2}-${g1}${pkSuffixReverse}` };
      } else {
        // PK付きの場合、合計スコアで勝敗判定
        const total1 = parseTotalScore(r.team1_scores);
        const total2 = parseTotalScore(r.team2_scores);
        const t1Won = total1 > total2;
        if (matrix[t1]) matrix[t1][t2] = { cls: '', text: `${t1Won ? '〇' : '●'}\n${g1}-${g2}${pkSuffix}` };
        if (matrix[t2]) matrix[t2][t1] = { cls: '', text: `${t1Won ? '●' : '〇'}\n${g2}-${g1}${pkSuffixReverse}` };
      }
    }

    const headerCells = blockTeams.map(t => `<th class="team-header">${esc(t.team_omission || t.team_name)}</th>`).join('');

    const rows = blockTeams.map(t1 => {
      const cells = blockTeams.map(t2 => {
        if (t1.team_name === t2.team_name) return '<td class="matrix-self">-</td>';
        const cell = matrix[t1.team_name]?.[t2.team_name];
        if (!cell) return '<td class="matrix-pending">未実施</td>';
        return `<td class="${cell.cls}"><div class="whitespace-pre">${esc(cell.text)}</div></td>`;
      }).join('');
      return `<tr><td style="text-align:left;font-weight:600;white-space:nowrap;background:#f8fafc;">${esc(t1.team_name)}</td>${cells}</tr>`;
    }).join('');

    const badgeClass = getBlockBadgeClass(blockName);
    return `<div class="card">
      <div class="card-header"><span class="badge ${badgeClass}">${esc(blockName)}ブロック 戦績表</span></div>
      <div class="card-body overflow-x-auto">
        <table class="matrix-table">
          <thead><tr><th>チーム</th>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

function generateStandingsContent(standings: StandingData[]): string {
  return standings.map(block => {
    const rankings = parseRankings(block.team_rankings);
    if (rankings.length === 0) return '';

    const isLeague = isLeagueStandings(block, rankings);
    const blockName = block.block_name;
    const isUnified = blockName.endsWith('_unified');
    const badgeClass = isUnified ? 'bg-block-final' : getBlockBadgeClass(blockName);
    // _unifiedブロックの場合はdisplay_round_nameを優先使用
    let displayName: string;
    if (isUnified) {
      displayName = block.display_round_name
        ? `${block.display_round_name}順位`
        : '決勝トーナメント順位';
    } else if (blockName === '決勝トーナメント' || blockName.includes('決勝')) {
      displayName = '決勝トーナメント順位';
    } else {
      displayName = `${blockName}ブロック順位表`;
    }

    let remarksHtml = '';
    if (block.remarks) {
      remarksHtml = `<div class="notice-box">${esc(block.remarks)}</div>`;
    }

    const headerRow = isLeague
      ? '<tr><th class="text-center" style="width:50px;">順位</th><th>チーム名</th><th class="text-center">勝点</th><th class="text-center">試合</th><th class="text-center">勝</th><th class="text-center">引</th><th class="text-center">敗</th><th class="text-center">得点</th><th class="text-center">失点</th><th class="text-center">得失差</th></tr>'
      : '<tr><th class="text-center" style="width:50px;">順位</th><th>チーム名</th><th>備考</th></tr>';

    const rows = rankings.map(team => {
      const rankClass = team.position === 1 ? 'rank-1' : team.position === 2 ? 'rank-2' : team.position === 3 ? 'rank-3' : '';

      if (isLeague) {
        const gd = team.goal_difference ?? 0;
        const gdClass = gd > 0 ? 'text-green' : gd < 0 ? 'text-red' : '';
        const gdStr = gd > 0 ? `+${gd}` : `${gd}`;
        return `<tr class="${rankClass}">
          <td class="text-center font-bold" style="font-size:1.1rem;">${team.position}</td>
          <td>
            <span class="font-bold">${esc(team.team_name)}</span>
          </td>
          <td class="text-center font-bold text-blue">${team.points ?? 0}</td>
          <td class="text-center">${team.matches_played ?? 0}</td>
          <td class="text-center text-green">${team.wins ?? 0}</td>
          <td class="text-center text-yellow">${team.draws ?? 0}</td>
          <td class="text-center text-red">${team.losses ?? 0}</td>
          <td class="text-center">${team.goals_for ?? 0}</td>
          <td class="text-center">${team.goals_against ?? 0}</td>
          <td class="text-center font-bold ${gdClass}">${gdStr}</td>
        </tr>`;
      } else {
        const remark = team.position === 1 ? '優勝' : team.position === 2 ? '準優勝' : team.position === 3 ? '3位' : team.position === 4 ? '4位' : '準々決勝敗退';
        return `<tr class="${rankClass}">
          <td class="text-center font-bold" style="font-size:1.1rem;">${team.position}</td>
          <td><span class="font-bold">${esc(team.team_name)}</span></td>
          <td class="text-gray">${remark}</td>
        </tr>`;
      }
    }).join('');

    return `<div class="card">
      <div class="card-header"><span class="badge ${badgeClass}">${esc(displayName)}</span></div>
      <div class="card-body">
        ${remarksHtml}
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>${headerRow}</thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }).join('');
}

function generateStandingsTab(data: ArchiveHtmlInput): string {
  const { standings } = data;
  if (standings.length === 0) {
    return '<div class="panel panel-standings"><p class="text-muted">順位データがありません</p></div>';
  }

  const content = generateStandingsContent(standings);

  return `<div class="panel panel-standings">
    <div class="card mb-4">
      <div class="card-body">
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value text-purple">${data.metadata.blocks_count}</div>
            <div class="stat-label">ブロック数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value text-blue">${data.metadata.total_teams}</div>
            <div class="stat-label">チーム数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value text-green">${data.metadata.completed_matches}</div>
            <div class="stat-label">完了試合</div>
          </div>
        </div>
      </div>
    </div>
    ${content}
  </div>`;
}

function generateTeamsTab(data: ArchiveHtmlInput): string {
  const { teams } = data;
  if (teams.length === 0) {
    return '<div class="panel panel-teams"><p class="text-muted">チームデータがありません</p></div>';
  }

  const teamItems = teams.map(team => {
    const displayName = team.team_omission || team.team_name;
    const fullName = team.team_omission ? team.team_name : '';
    let statusHtml = '';
    if (team.withdrawal_status && team.withdrawal_status !== 'active') {
      const label = team.withdrawal_status === 'withdrawal_approved' ? '辞退済み' : '辞退申請中';
      statusHtml = ` <span class="badge badge-red" style="font-size:0.7rem;margin-left:6px;">${label}</span>`;
    }
    return `<div class="team-card">
      <span class="font-bold">${esc(displayName)}</span>${fullName ? `<span class="text-gray text-sm" style="margin-left:6px;">(${esc(fullName)})</span>` : ''}${statusHtml}
    </div>`;
  }).join('');

  return `<div class="panel panel-teams">
    <div class="card">
      <div class="card-header">&#x1F465; 参加チーム（${teams.length}チーム）</div>
      <div class="card-body">
        <div class="team-grid">${teamItems}</div>
      </div>
    </div>
  </div>`;
}

// ===== Main Generator =====

export function generateArchiveHtml(data: ArchiveHtmlInput): string {
  const t = data.tournament;

  // Determine phases with bracket data
  const phaseIds: string[] = [];
  const phaseNames: Record<string, string> = {};

  // Detect distinct phases from matches
  const phases = new Set(data.matches.map(m => m.phase));

  // フェーズ名をstandingsのdisplay_round_nameから取得
  const phaseDisplayNames: Record<string, string> = {};
  for (const s of data.standings) {
    if (s.phase && s.display_round_name && !phaseDisplayNames[s.phase]) {
      phaseDisplayNames[s.phase] = s.display_round_name;
    }
  }
  // matchesのdisplay_round_nameからもフォールバック
  for (const m of data.matches) {
    if (m.phase && m.display_round_name && !phaseDisplayNames[m.phase]) {
      phaseDisplayNames[m.phase] = m.display_round_name;
    }
  }

  // 各フェーズのタブを追加（ブラケットや戦績表があるフェーズ）
  for (const phase of phases) {
    const phaseMatches = data.matches.filter(m => m.phase === phase);
    const hasBlocks = new Set(phaseMatches.map(m => m.block_name)).size > 0;

    if (hasBlocks) {
      phaseIds.push(phase);
      // _unifiedブロックの場合はdisplay_round_nameを優先使用（ライブ版と同じ）
      const blockNames = [...new Set(phaseMatches.map(m => m.block_name))];
      const isUnified = blockNames.some(bn => bn.endsWith('_unified'));

      if (phaseDisplayNames[phase]) {
        phaseNames[phase] = phaseDisplayNames[phase];
      } else if (isUnified) {
        // _unifiedの場合はフェーズIDからラベルを生成
        const baseName = phase.replace(/_unified$/, '');
        phaseNames[phase] = baseName === 'preliminary' ? '予選' :
                           baseName === 'final' ? '決勝' :
                           baseName === 'phase_tournament' ? '決勝トーナメント' :
                           phaseDisplayNames[phase] || baseName;
      } else if (phase === 'preliminary') {
        phaseNames[phase] = '予選';
      } else if (phase === 'final') {
        phaseNames[phase] = '決勝';
      } else {
        phaseNames[phase] = phase;
      }
    }
  }

  // Build phase-specific bracket data
  // ブラケットデータのblock_nameからフェーズを推定して振り分け
  const phaseBracketData: Record<string, Record<string, BracketMatch[]>> = {};
  for (const phase of phaseIds) {
    phaseBracketData[phase] = {};
  }
  if (data.bracketData) {
    for (const [blockName, blockMatches] of Object.entries(data.bracketData)) {
      // ブラケットの試合からフェーズを特定
      // bracketDataのmatchにはblock_nameがあるのでそれを元にphaseを推定
      let targetPhase = 'final'; // デフォルト
      for (const phase of phaseIds) {
        const phaseBlockNames = new Set(data.matches.filter(m => m.phase === phase).map(m => m.block_name));
        if (phaseBlockNames.has(blockName)) {
          targetPhase = phase;
          break;
        }
      }
      if (!phaseBracketData[targetPhase]) phaseBracketData[targetPhase] = {};
      phaseBracketData[targetPhase][blockName] = blockMatches;
    }
  }

  // Generate dynamic CSS for phase tabs
  const dynamicCss = generatePhaseTabCss(phaseIds);

  // Build tab inputs
  const tabInputs = [
    '<input type="radio" name="tab" id="tab-overview" checked>',
    '<input type="radio" name="tab" id="tab-schedule">',
    ...phaseIds.map(id => `<input type="radio" name="tab" id="tab-phase-${esc(id)}">`),
    '<input type="radio" name="tab" id="tab-standings">',
    '<input type="radio" name="tab" id="tab-teams">',
  ].join('\n  ');

  // Build tab nav
  const tabNavItems = [
    '<label for="tab-overview">概要</label>',
    '<label for="tab-schedule">日程・結果</label>',
    ...phaseIds.map(id => `<label for="tab-phase-${esc(id)}">${esc(phaseNames[id] || id)}</label>`),
    '<label for="tab-standings">順位表</label>',
    '<label for="tab-teams">参加チーム</label>',
  ].join('\n      ');

  // Build tab panels
  const phasePanels = phaseIds.map(id =>
    generatePhaseTab(id, phaseNames[id] || id, phaseBracketData[id] || {}, data.matches, data.teams, data.standings, data.results, data.sportConfig)
  ).join('\n');

  const archiveDateStr = data.archivedAt ? formatDateJa(data.archivedAt) : formatDateJa(new Date().toISOString());

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(t.tournament_name)} アーカイブ</title>
  <style>${ARCHIVE_CSS}${dynamicCss}</style>
</head>
<body>
  <div class="archive-container">
    <header class="archive-header">
      <h1>${esc(t.tournament_name)}<span class="archive-badge">ARCHIVED</span></h1>
      <div class="subtitle">アーカイブ日: ${esc(archiveDateStr)} | 作成者: ${esc(data.archivedBy)}</div>
    </header>

    ${tabInputs}

    <nav class="tab-nav">
      ${tabNavItems}
    </nav>

    <div class="tab-panels">
      ${generateOverviewTab(data)}
      ${generateScheduleTab(data)}
      ${phasePanels}
      ${generateStandingsTab(data)}
      ${generateTeamsTab(data)}
    </div>

    <footer class="archive-footer">
      アーカイブ作成日: ${esc(archiveDateStr)} | ${esc(t.tournament_name)}<br>
      このページは大会終了時の状態を静的に保存したものです
    </footer>
  </div>

  <script>
    // iframe高さ通知
    function notifyHeight(){var h=document.documentElement.scrollHeight;parent.postMessage({type:'archive-height',height:h},'*');}
    window.addEventListener('load',notifyHeight);
    new MutationObserver(notifyHeight).observe(document.body,{childList:true,subtree:true});
    document.querySelectorAll('input[name="tab"]').forEach(function(r){r.addEventListener('change',function(){setTimeout(notifyHeight,50);});});
  </script>
</body>
</html>`;
}
