import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const tournamentId = parseInt(id);
    
    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 大会が存在するかチェック
    const tournamentCheck = await db.execute(
      'SELECT tournament_id, tournament_name, status FROM t_tournaments WHERE tournament_id = ?',
      [tournamentId]
    );

    if (tournamentCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '指定された大会が見つかりません' },
        { status: 404 }
      );
    }

    const tournament = tournamentCheck.rows[0];
    
    // 開催中または完了済みの大会は削除不可
    if (tournament.status === 'ongoing' || tournament.status === 'completed') {
      return NextResponse.json(
        { success: false, error: '開催中または完了済みの大会は削除できません' },
        { status: 400 }
      );
    }

    // 関連データを順序立てて削除（外部キー制約に配慮）
    try {
      console.log(`削除開始: 大会ID ${tournamentId}`);

      // 1. 試合結果データ削除（t_matches_finalが存在する場合）
      try {
        await db.execute(
          'DELETE FROM t_matches_final WHERE match_id IN (SELECT match_id FROM t_matches_live WHERE match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?))',
          [tournamentId]
        );
        console.log('✓ 試合結果データ削除完了');
      } catch (err) {
        console.warn('試合結果データ削除をスキップ:', err);
      }

      // 2. ライブ試合データ削除
      try {
        await db.execute(
          'DELETE FROM t_matches_live WHERE match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?)',
          [tournamentId]
        );
        console.log('✓ ライブ試合データ削除完了');
      } catch (err) {
        console.warn('ライブ試合データ削除をスキップ:', err);
      }

      // 3. 試合ブロックデータ削除
      try {
        await db.execute(
          'DELETE FROM t_match_blocks WHERE tournament_id = ?',
          [tournamentId]
        );
        console.log('✓ 試合ブロックデータ削除完了');
      } catch (err) {
        console.warn('試合ブロックデータ削除をスキップ:', err);
      }

      // 4. 大会参加選手データ削除（t_tournament_playersが存在する場合）
      try {
        await db.execute(
          'DELETE FROM t_tournament_players WHERE tournament_id = ?',
          [tournamentId]
        );
        console.log('✓ 大会参加選手データ削除完了');
      } catch (err) {
        console.warn('大会参加選手データ削除をスキップ:', err);
      }

      // 5. 大会参加チームデータ削除（t_tournament_teamsが存在する場合）
      try {
        await db.execute(
          'DELETE FROM t_tournament_teams WHERE tournament_id = ?',
          [tournamentId]
        );
        console.log('✓ 大会参加チームデータ削除完了');
      } catch (err) {
        console.warn('大会参加チームデータ削除をスキップ:', err);
      }

      // 6. 大会データ削除
      await db.execute(
        'DELETE FROM t_tournaments WHERE tournament_id = ?',
        [tournamentId]
      );
      console.log('✓ 大会データ削除完了');

      console.log(`🗑️ 大会削除完了: ${tournament.tournament_name} (ID: ${tournamentId})`);

      return NextResponse.json({
        success: true,
        message: `大会「${tournament.tournament_name}」を削除しました`
      });

    } catch (deleteError) {
      console.error('大会削除エラー:', deleteError);
      return NextResponse.json(
        { success: false, error: `大会削除中にエラーが発生しました: ${deleteError instanceof Error ? deleteError.message : '不明なエラー'}` },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('大会削除API エラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}