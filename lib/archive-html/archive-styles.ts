/**
 * アーカイブHTML用の埋め込みCSSスタイルシート
 * 自己完結型HTMLに含める最小限のCSS
 */

export const ARCHIVE_CSS = `
/* ===== Reset & Base ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 15.5px; -webkit-text-size-adjust: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
  line-height: 1.6;
  color: #1a1a2e;
  background: #f8fafc;
}
a { color: #2563eb; text-decoration: none; }
table { border-collapse: collapse; width: 100%; }

/* ===== Layout ===== */
.archive-container { max-width: 1100px; margin: 0 auto; padding: 16px; }

/* ===== Header ===== */
.archive-header {
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  color: #fff;
  padding: 24px;
  border-radius: 12px;
  margin-bottom: 20px;
}
.archive-header h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }
.archive-header .subtitle { font-size: 0.85rem; opacity: 0.8; }
.archive-badge {
  display: inline-block;
  background: rgba(168, 85, 247, 0.25);
  border: 1px solid rgba(168, 85, 247, 0.5);
  color: #d8b4fe;
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: 10px;
  vertical-align: middle;
}

/* ===== CSS-only Tabs ===== */
input[name="tab"] { display: none; }
.tab-nav {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid #e2e8f0;
  margin-bottom: 20px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 0;
}
.tab-nav label {
  padding: 10px 16px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  color: #64748b;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
  user-select: none;
}
.tab-nav label:hover { color: #1e293b; }
.tab-panels .panel { display: none; }

/* Tab activation via CSS radio buttons */
#tab-overview:checked ~ .tab-nav label[for="tab-overview"],
#tab-schedule:checked ~ .tab-nav label[for="tab-schedule"],
#tab-standings:checked ~ .tab-nav label[for="tab-standings"],
#tab-teams:checked ~ .tab-nav label[for="tab-teams"] {
  color: #2563eb;
  border-bottom-color: #2563eb;
  font-weight: 600;
}
#tab-overview:checked ~ .tab-panels .panel-overview,
#tab-schedule:checked ~ .tab-panels .panel-schedule,
#tab-standings:checked ~ .tab-panels .panel-standings,
#tab-teams:checked ~ .tab-panels .panel-teams {
  display: block;
}

/* ===== Card ===== */
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 16px;
  overflow: hidden;
}
.card-header {
  padding: 14px 18px;
  border-bottom: 1px solid #f1f5f9;
  font-weight: 600;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 8px;
}
.card-body { padding: 16px 18px; }

/* ===== Stats Grid ===== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.stat-item {
  text-align: center;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
}
.stat-value { font-size: 1.5rem; font-weight: 700; }
.stat-label { font-size: 0.75rem; color: #64748b; margin-top: 2px; }

/* ===== Badges ===== */
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.5;
}
.badge-blue { background: #dbeafe; color: #1e40af; }
.badge-green { background: #dcfce7; color: #166534; }
.badge-yellow { background: #fef9c3; color: #854d0e; }
.badge-purple { background: #f3e8ff; color: #6b21a8; }
.badge-red { background: #fee2e2; color: #991b1b; }
.badge-gray { background: #f1f5f9; color: #475569; }
.badge-orange { background: #ffedd5; color: #9a3412; }

/* ===== Block colors ===== */
.block-a { color: #2563eb; }
.block-b { color: #16a34a; }
.block-c { color: #ca8a04; }
.block-d { color: #9333ea; }
.block-final { color: #dc2626; }

.bg-block-a { background: #dbeafe; color: #1e40af; }
.bg-block-b { background: #dcfce7; color: #166534; }
.bg-block-c { background: #fef9c3; color: #854d0e; }
.bg-block-d { background: #f3e8ff; color: #6b21a8; }
.bg-block-final { background: #fee2e2; color: #991b1b; }

/* ===== Tables ===== */
.data-table { width: 100%; font-size: 0.85rem; }
.data-table th {
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  color: #475569;
  background: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
  white-space: nowrap;
}
.data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}
.data-table tbody tr:hover { background: #f8fafc; }
.data-table .text-center { text-align: center; }
.data-table .text-right { text-align: right; }
.data-table .font-bold { font-weight: 700; }

/* Standings highlight */
.rank-1 { background: #fefce8; border-left: 3px solid #eab308; }
.rank-2 { background: #f8fafc; border-left: 3px solid #94a3b8; }
.rank-3 { background: #fffbeb; border-left: 3px solid #f59e0b; }

/* ===== Results Matrix ===== */
.matrix-table { font-size: 0.75rem; }
.matrix-table th, .matrix-table td {
  padding: 4px 6px;
  border: 1px solid #e2e8f0;
  text-align: center;
  min-width: 55px;
}
.matrix-table th { background: #f1f5f9; font-weight: 600; }
.matrix-table .team-header {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  min-width: 30px;
  padding: 6px 4px;
  font-size: 0.7rem;
  white-space: nowrap;
}
.matrix-self { background: #374151; color: #fff; }
.matrix-win { background: #dcfce7; color: #166534; }
.matrix-loss { background: #fee2e2; color: #991b1b; }
.matrix-draw { background: #fef9c3; color: #854d0e; }
.matrix-walkover-win { background: #bbf7d0; color: #14532d; }
.matrix-walkover-loss { background: #fecaca; color: #7f1d1d; }
.matrix-pending { background: #f1f5f9; color: #94a3b8; }

/* Stats columns in matrix */
.matrix-stat-header { background: #dbeafe !important; color: #1e40af !important; }
.matrix-stat { background: #eff6ff; }

/* ===== Bracket ===== */
.bracket-container {
  position: relative;
  overflow-x: auto;
  padding: 16px 0;
}
.bracket-block {
  margin-bottom: 24px;
}
.bracket-grid {
  display: flex;
  gap: 80px;
  position: relative;
  min-width: max-content;
}
.bracket-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
  min-width: 200px;
}
.round-label {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
  display: inline-block;
}
.match-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  min-width: 180px;
  position: relative;
}
.match-card .match-code {
  position: absolute;
  top: -8px;
  left: 10px;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  z-index: 1;
}
.match-team {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  font-size: 0.8rem;
  gap: 4px;
}
.match-team:first-of-type { border-bottom: 1px solid #e2e8f0; }
.match-team-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.match-team-score { font-weight: 700; min-width: 18px; text-align: center; }
.match-team.winner { background: #dcfce7; }
.match-team.loser { background: #fee2e2; }
.match-team.draw { background: #dbeafe; }
.match-team .pk-score { font-size: 0.65rem; color: #6b7280; margin-left: 2px; }
.match-status {
  text-align: center;
  font-size: 0.65rem;
  padding: 2px;
  color: #64748b;
  background: #f8fafc;
}

/* Seed card */
.seed-card {
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  padding: 10px 14px;
  background: #f8fafc;
  font-size: 0.8rem;
  color: #64748b;
  min-width: 180px;
  text-align: center;
}

/* SVG connectors */
.bracket-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
.bracket-svg line, .bracket-svg path {
  stroke: #cbd5e1;
  stroke-width: 1.5;
  fill: none;
}

/* ===== Team Cards ===== */
.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.team-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px;
  background: #fff;
}
.team-card h3 { font-size: 1rem; font-weight: 600; margin-bottom: 4px; }
.team-card .team-abbr {
  display: inline-block;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #64748b;
  margin-left: 6px;
}
.team-card .player-count { font-size: 0.85rem; color: #64748b; }
.team-card .withdrawal { color: #dc2626; font-weight: 500; font-size: 0.8rem; margin-top: 4px; }

/* Player table inside team card */
.player-table { width: 100%; font-size: 0.8rem; margin-top: 8px; }
.player-table th {
  padding: 4px 8px;
  text-align: left;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.75rem;
}
.player-table td {
  padding: 4px 8px;
  border-bottom: 1px solid #f1f5f9;
}

/* ===== Info Grid ===== */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}
.info-item { padding: 12px; background: #f8fafc; border-radius: 8px; }
.info-item .label { font-size: 0.75rem; color: #64748b; margin-bottom: 2px; }
.info-item .value { font-weight: 600; }

/* ===== Footer ===== */
.archive-footer {
  text-align: center;
  padding: 20px;
  font-size: 0.75rem;
  color: #94a3b8;
  border-top: 1px solid #e2e8f0;
  margin-top: 24px;
}

/* ===== Utilities ===== */
.text-green { color: #16a34a; }
.text-red { color: #dc2626; }
.text-blue { color: #2563eb; }
.text-yellow { color: #ca8a04; }
.text-purple { color: #9333ea; }
.text-orange { color: #ea580c; }
.text-gray { color: #64748b; }
.text-muted { color: #94a3b8; }
.font-bold { font-weight: 700; }
.text-sm { font-size: 0.85rem; }
.text-xs { font-size: 0.75rem; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.mb-2 { margin-bottom: 8px; }
.mb-4 { margin-bottom: 16px; }
.space-y > * + * { margin-top: 12px; }
.overflow-x-auto { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.whitespace-pre { white-space: pre-line; }
.notice-box {
  padding: 10px 14px;
  background: #fefce8;
  border-left: 3px solid #eab308;
  border-radius: 0 6px 6px 0;
  font-size: 0.85rem;
  color: #854d0e;
  margin-bottom: 12px;
}

/* ===== Responsive ===== */
@media (max-width: 640px) {
  html { font-size: 14px; }
  .archive-container { padding: 10px; }
  .archive-header { padding: 16px; border-radius: 8px; }
  .archive-header h1 { font-size: 1.2rem; }
  .tab-nav label { padding: 8px 10px; font-size: 0.8rem; }
  .card-header { padding: 10px 14px; font-size: 0.9rem; }
  .card-body { padding: 10px 14px; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .info-grid { grid-template-columns: 1fr; }
  .team-grid { grid-template-columns: 1fr; }
  .data-table { font-size: 0.8rem; }
  .data-table th, .data-table td { padding: 6px 8px; }
  .bracket-grid { gap: 40px; }
  .match-card { min-width: 150px; }
}

/* ===== Print ===== */
@media print {
  body { background: #fff; }
  .archive-container { max-width: 100%; padding: 0; }
  .tab-nav { display: none; }
  input[name="tab"] { display: none; }
  .tab-panels .panel { display: block !important; page-break-inside: avoid; margin-bottom: 20px; }
  .card { break-inside: avoid; border: 1px solid #ccc; }
  .archive-header { background: #1e293b !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/**
 * 動的フェーズタブ用のCSS生成
 * フェーズIDに応じたタブ表示ルールを生成する
 */
export function generatePhaseTabCss(phaseIds: string[]): string {
  return phaseIds.map(id => {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    return `
#tab-phase-${safeId}:checked ~ .tab-nav label[for="tab-phase-${safeId}"] {
  color: #2563eb;
  border-bottom-color: #2563eb;
  font-weight: 600;
}
#tab-phase-${safeId}:checked ~ .tab-panels .panel-phase-${safeId} {
  display: block;
}`;
  }).join('\n');
}
