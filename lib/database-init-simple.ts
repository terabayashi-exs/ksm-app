// lib/database-init-simple.ts
import { db } from './db';

export async function initializeDatabaseSimple() {
  try {
    // マスターテーブルを順次作成
    console.log('Creating master tables...');

    // 会場マスター
    await db.execute(`
      CREATE TABLE IF NOT EXISTS m_venues (
        venue_id INTEGER PRIMARY KEY AUTOINCREMENT,
        venue_name TEXT NOT NULL,
        address TEXT,
        available_courts INTEGER NOT NULL DEFAULT 4,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 大会フォーマットマスター
    await db.execute(`
      CREATE TABLE IF NOT EXISTS m_tournament_formats (
        format_id INTEGER PRIMARY KEY AUTOINCREMENT,  
        format_name TEXT NOT NULL,
        target_team_count INTEGER NOT NULL,
        format_description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // チームマスター
    await db.execute(`
      CREATE TABLE IF NOT EXISTS m_teams (
        team_id TEXT PRIMARY KEY,
        team_name TEXT NOT NULL,
        team_omission TEXT,
        contact_person TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        contact_phone TEXT,
        representative_player_id INTEGER,
        password_hash TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 選手マスター
    await db.execute(`
      CREATE TABLE IF NOT EXISTS m_players (
        player_id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_name TEXT NOT NULL,
        jersey_number INTEGER,
        current_team_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (current_team_id) REFERENCES m_teams(team_id)
      )
    `);

    // 管理者マスター
    await db.execute(`
      CREATE TABLE IF NOT EXISTS m_administrators (
        admin_login_id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 試合テンプレートマスター
    await db.execute(`
      CREATE TABLE IF NOT EXISTS m_match_templates (
        template_id INTEGER PRIMARY KEY AUTOINCREMENT,
        format_id INTEGER NOT NULL,
        match_number INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        match_type TEXT NOT NULL,
        phase TEXT NOT NULL,
        round_name TEXT,
        block_name TEXT,
        team1_source TEXT,
        team2_source TEXT,
        team1_display_name TEXT NOT NULL,
        team2_display_name TEXT NOT NULL,
        day_number INTEGER NOT NULL DEFAULT 1,
        execution_priority INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (format_id) REFERENCES m_tournament_formats(format_id)
      )
    `);

    console.log('Creating transaction tables...');

    // 大会テーブル
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_tournaments (
        tournament_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_name TEXT NOT NULL,
        format_id INTEGER NOT NULL,
        venue_id INTEGER NOT NULL,
        team_count INTEGER NOT NULL,
        court_count INTEGER NOT NULL DEFAULT 4,
        tournament_dates TEXT,
        match_duration_minutes INTEGER NOT NULL DEFAULT 15,
        break_duration_minutes INTEGER NOT NULL DEFAULT 5,
        win_points INTEGER NOT NULL DEFAULT 3,
        draw_points INTEGER NOT NULL DEFAULT 1,
        loss_points INTEGER NOT NULL DEFAULT 0,
        walkover_winner_goals INTEGER NOT NULL DEFAULT 3,
        walkover_loser_goals INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'ongoing', 'completed')),
        is_public INTEGER NOT NULL DEFAULT 0,
        event_start_date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (format_id) REFERENCES m_tournament_formats(format_id),
        FOREIGN KEY (venue_id) REFERENCES m_venues(venue_id)
      )
    `);

    // 大会参加チームテーブル
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_tournament_teams (
        tournament_team_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        team_id TEXT NOT NULL,
        assigned_block TEXT,
        block_position INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id),
        FOREIGN KEY (team_id) REFERENCES m_teams(team_id),
        UNIQUE(tournament_id, team_id)
      )
    `);

    // 試合ブロックテーブル
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_match_blocks (
        match_block_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        phase TEXT NOT NULL,
        display_round_name TEXT,
        block_name TEXT NOT NULL,
        match_type TEXT NOT NULL,
        block_order INTEGER NOT NULL DEFAULT 0,
        team_rankings TEXT,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id)
      )
    `);

    // 試合ライブテーブル
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_matches_live (
        match_id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_block_id INTEGER NOT NULL,
        tournament_date TEXT NOT NULL,
        match_number INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        team1_id TEXT,
        team2_id TEXT,
        team1_display_name TEXT NOT NULL,
        team2_display_name TEXT NOT NULL,
        court_number INTEGER,
        start_time TEXT,
        team1_goals INTEGER NOT NULL DEFAULT 0,
        team2_goals INTEGER NOT NULL DEFAULT 0,
        winner_team_id TEXT,
        is_draw INTEGER NOT NULL DEFAULT 0,
        is_walkover INTEGER NOT NULL DEFAULT 0,
        match_status TEXT NOT NULL DEFAULT 'scheduled' CHECK (match_status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
        result_status TEXT NOT NULL DEFAULT 'none' CHECK (result_status IN ('none', 'pending', 'confirmed')),
        remarks TEXT,
        entered_by TEXT,
        entered_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (match_block_id) REFERENCES t_match_blocks(match_block_id),
        FOREIGN KEY (team1_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (team2_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (winner_team_id) REFERENCES m_teams(team_id)
      )
    `);

    // 試合確定テーブル
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_matches_final (
        match_id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_block_id INTEGER NOT NULL,
        tournament_date TEXT NOT NULL,
        match_number INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        team1_id TEXT,
        team2_id TEXT,
        team1_display_name TEXT NOT NULL,
        team2_display_name TEXT NOT NULL,
        court_number INTEGER,
        start_time TEXT,
        team1_goals INTEGER NOT NULL DEFAULT 0,
        team2_goals INTEGER NOT NULL DEFAULT 0,
        winner_team_id TEXT,
        is_draw INTEGER NOT NULL DEFAULT 0,
        is_walkover INTEGER NOT NULL DEFAULT 0,
        remarks TEXT,
        confirmed_by TEXT,
        confirmed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (match_block_id) REFERENCES t_match_blocks(match_block_id),
        FOREIGN KEY (team1_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (team2_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (winner_team_id) REFERENCES m_teams(team_id)
      )
    `);

    console.log('Creating indexes...');

    // インデックス作成
    await db.execute('CREATE INDEX IF NOT EXISTS idx_tournaments_status ON t_tournaments(status)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_tournaments_public ON t_tournaments(is_public)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament ON t_tournament_teams(tournament_id)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_tournament_teams_team ON t_tournament_teams(team_id)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_match_blocks_tournament ON t_match_blocks(tournament_id)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_matches_live_block ON t_matches_live(match_block_id)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_matches_live_status ON t_matches_live(match_status)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_matches_live_result_status ON t_matches_live(result_status)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_matches_final_block ON t_matches_final(match_block_id)');

    console.log('Database tables and indexes created successfully');
    return { success: true, message: 'Database initialized successfully' };
  } catch (error) {
    console.error('Database initialization failed:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function seedInitialData() {
  try {
    console.log('Seeding initial data...');

    // 会場データの初期投入
    await db.execute(`
      INSERT OR IGNORE INTO m_venues (venue_name, address, available_courts) VALUES 
      ('メイン会場', '東京都渋谷区', 4),
      ('サブ会場A', '東京都新宿区', 2),
      ('サブ会場B', '東京都世田谷区', 3)
    `);

    // 大会フォーマットデータの初期投入
    await db.execute(`
      INSERT OR IGNORE INTO m_tournament_formats (format_name, target_team_count, format_description) VALUES 
      ('4チーム総当たりリーグ戦', 4, '4チーム全てが総当たりでリーグ戦を実施。少数チームに最適'),
      ('6チーム総当たりリーグ戦', 6, '6チーム全てが総当たりでリーグ戦を実施。試合数とバランスが良い'),
      ('8チーム予選リーグ+決勝トーナメント', 8, '8チームを2つのリーグに分けて予選を行い、上位チームで決勝トーナメントを実施'),
      ('12チーム予選リーグ+決勝トーナメント', 12, '12チームを3つのリーグに分けて予選を行い、上位チームで決勝トーナメントを実施'),
      ('16チーム予選リーグ+決勝トーナメント', 16, '16チームを4つのリーグに分けて予選を行い、上位チームで決勝トーナメントを実施'),
      ('8チーム決勝トーナメント', 8, '8チームで決勝トーナメントのみを実施。短時間で完了'),
      ('16チーム決勝トーナメント', 16, '16チームで決勝トーナメントのみを実施。ストレート勝負')
    `);

    // 管理者アカウントの初期投入
    const bcrypt = await import('bcryptjs');
    const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    await db.execute(`
      INSERT OR IGNORE INTO m_administrators (admin_login_id, password_hash, email) VALUES 
      ('admin', ?, ?)
    `, [hashedPassword, process.env.ADMIN_DEFAULT_EMAIL || 'admin@example.com']);

    // 試合テンプレートデータの初期投入
    console.log('Creating match templates...');
    
    // 8チーム予選リーグ+決勝トーナメント (format_id: 3) - 簡略化
    const eightTeamTemplates = [
      // 予選リーグ（Day 1）- Aブロック
      { format_id: 3, match_number: 1, match_code: 'A1', match_type: 'preliminary', phase: 'preliminary', block_name: 'Aブロック', team1_display_name: 'A1位', team2_display_name: 'A2位', day_number: 1, execution_priority: 1 },
      { format_id: 3, match_number: 2, match_code: 'A2', match_type: 'preliminary', phase: 'preliminary', block_name: 'Aブロック', team1_display_name: 'A3位', team2_display_name: 'A4位', day_number: 1, execution_priority: 1 },
      { format_id: 3, match_number: 3, match_code: 'A3', match_type: 'preliminary', phase: 'preliminary', block_name: 'Aブロック', team1_display_name: 'A1位', team2_display_name: 'A3位', day_number: 1, execution_priority: 2 },
      { format_id: 3, match_number: 4, match_code: 'A4', match_type: 'preliminary', phase: 'preliminary', block_name: 'Aブロック', team1_display_name: 'A2位', team2_display_name: 'A4位', day_number: 1, execution_priority: 2 },
      { format_id: 3, match_number: 5, match_code: 'A5', match_type: 'preliminary', phase: 'preliminary', block_name: 'Aブロック', team1_display_name: 'A1位', team2_display_name: 'A4位', day_number: 1, execution_priority: 3 },
      { format_id: 3, match_number: 6, match_code: 'A6', match_type: 'preliminary', phase: 'preliminary', block_name: 'Aブロック', team1_display_name: 'A2位', team2_display_name: 'A3位', day_number: 1, execution_priority: 3 },
      
      // 予選リーグ（Day 1）- Bブロック
      { format_id: 3, match_number: 7, match_code: 'B1', match_type: 'preliminary', phase: 'preliminary', block_name: 'Bブロック', team1_display_name: 'B1位', team2_display_name: 'B2位', day_number: 1, execution_priority: 1 },
      { format_id: 3, match_number: 8, match_code: 'B2', match_type: 'preliminary', phase: 'preliminary', block_name: 'Bブロック', team1_display_name: 'B3位', team2_display_name: 'B4位', day_number: 1, execution_priority: 1 },
      { format_id: 3, match_number: 9, match_code: 'B3', match_type: 'preliminary', phase: 'preliminary', block_name: 'Bブロック', team1_display_name: 'B1位', team2_display_name: 'B3位', day_number: 1, execution_priority: 2 },
      { format_id: 3, match_number: 10, match_code: 'B4', match_type: 'preliminary', phase: 'preliminary', block_name: 'Bブロック', team1_display_name: 'B2位', team2_display_name: 'B4位', day_number: 1, execution_priority: 2 },
      { format_id: 3, match_number: 11, match_code: 'B5', match_type: 'preliminary', phase: 'preliminary', block_name: 'Bブロック', team1_display_name: 'B1位', team2_display_name: 'B4位', day_number: 1, execution_priority: 3 },
      { format_id: 3, match_number: 12, match_code: 'B6', match_type: 'preliminary', phase: 'preliminary', block_name: 'Bブロック', team1_display_name: 'B2位', team2_display_name: 'B3位', day_number: 1, execution_priority: 3 },
      
      // 決勝トーナメント（Day 2）
      { format_id: 3, match_number: 13, match_code: 'SF1', match_type: 'semifinal', phase: 'final', block_name: '決勝トーナメント', team1_display_name: 'A1位', team2_display_name: 'B2位', day_number: 2, execution_priority: 1 },
      { format_id: 3, match_number: 14, match_code: 'SF2', match_type: 'semifinal', phase: 'final', block_name: '決勝トーナメント', team1_display_name: 'B1位', team2_display_name: 'A2位', day_number: 2, execution_priority: 1 },
      { format_id: 3, match_number: 15, match_code: '3RD', match_type: 'third_place', phase: 'final', block_name: '決勝トーナメント', team1_display_name: 'SF1敗者', team2_display_name: 'SF2敗者', day_number: 2, execution_priority: 2 },
      { format_id: 3, match_number: 16, match_code: 'FINAL', match_type: 'final', phase: 'final', block_name: '決勝トーナメント', team1_display_name: 'SF1勝者', team2_display_name: 'SF2勝者', day_number: 2, execution_priority: 3 }
    ];

    // 6チーム総当たりリーグ戦 (format_id: 2) - 既存データなので削除
    const sixTeamTemplates: typeof eightTeamTemplates = [];

    // 4チーム総当たりリーグ戦 (format_id: 1) - 既存データなので削除
    const fourTeamTemplates: typeof eightTeamTemplates = [];

    // 全テンプレートを結合
    const allTemplates = [...fourTeamTemplates, ...sixTeamTemplates, ...eightTeamTemplates];

    // バッチでインサート
    for (const template of allTemplates) {
      await db.execute(`
        INSERT OR IGNORE INTO m_match_templates (
          format_id, match_number, match_code, match_type, phase, 
          round_name, block_name, team1_source, team2_source, 
          team1_display_name, team2_display_name, day_number, 
          execution_priority
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        template.format_id,
        template.match_number,
        template.match_code,
        template.match_type,
        template.phase,
        template.match_type,
        template.block_name,
        '',
        '',
        template.team1_display_name,
        template.team2_display_name,
        template.day_number,
        template.execution_priority
      ]);
    }

    console.log('Match templates created successfully');
    console.log('Initial data seeded successfully');
    return { success: true, message: 'Initial data seeded successfully' };
  } catch (error) {
    console.error('Data seeding failed:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}