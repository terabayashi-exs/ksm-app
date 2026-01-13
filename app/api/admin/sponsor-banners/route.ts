// app/api/admin/sponsor-banners/route.ts
// スポンサーバナー管理API（一覧取得・作成）

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateSponsorBannerInput } from '@/lib/sponsor-banner-specs';

// バナー一覧取得（管理者用）
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get('tournament_id');

    if (!tournamentId) {
      return NextResponse.json(
        { error: 'tournament_idが必要です' },
        { status: 400 }
      );
    }

    const result = await db.execute({
      sql: `
        SELECT
          banner_id,
          tournament_id,
          banner_name,
          banner_url,
          image_blob_url,
          image_filename,
          file_size,
          display_position,
          target_tab,
          display_order,
          is_active,
          start_date,
          end_date,
          click_count,
          created_at,
          updated_at
        FROM t_sponsor_banners
        WHERE tournament_id = ?
        ORDER BY display_position, display_order, banner_id
      `,
      args: [tournamentId],
    });

    return NextResponse.json({
      banners: result.rows,
    });
  } catch (error) {
    console.error('バナー取得エラー:', error);
    return NextResponse.json(
      { error: 'バナーの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// バナー作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const body: CreateSponsorBannerInput = await request.json();
    console.log('📝 バナー作成リクエスト受信:', JSON.stringify(body, null, 2));

    const {
      tournament_id,
      banner_name,
      banner_url,
      image_blob_url,
      image_filename,
      file_size,
      display_position,
      target_tab = 'all',
      display_order = 0,
      is_active = 1,
      start_date,
      end_date,
    } = body;

    // バリデーション
    if (!tournament_id || !banner_name || !image_blob_url || !display_position) {
      return NextResponse.json(
        { error: '必須フィールドが不足しています' },
        { status: 400 }
      );
    }

    // display_positionの値チェック
    if (!['top', 'bottom', 'sidebar'].includes(display_position)) {
      return NextResponse.json(
        { error: '無効なdisplay_positionです' },
        { status: 400 }
      );
    }

    // target_tabの値チェック
    const validTabs = ['all', 'overview', 'schedule', 'preliminary', 'final', 'standings', 'teams'];
    if (!validTabs.includes(target_tab)) {
      return NextResponse.json(
        { error: '無効なtarget_tabです' },
        { status: 400 }
      );
    }

    console.log('💾 データベースに登録中...');
    const result = await db.execute({
      sql: `
        INSERT INTO t_sponsor_banners (
          tournament_id,
          banner_name,
          banner_url,
          image_blob_url,
          image_filename,
          file_size,
          display_position,
          target_tab,
          display_order,
          is_active,
          start_date,
          end_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        tournament_id,
        banner_name,
        banner_url || null,
        image_blob_url,
        image_filename || null,
        file_size || null,
        display_position,
        target_tab,
        display_order,
        is_active,
        start_date || null,
        end_date || null,
      ],
    });

    console.log('✅ データベース登録完了:', { lastInsertRowid: result.lastInsertRowid });

    // 作成したバナーを取得
    const bannerId = Number(result.lastInsertRowid);
    const createdBanner = await db.execute({
      sql: 'SELECT * FROM t_sponsor_banners WHERE banner_id = ?',
      args: [bannerId],
    });

    console.log('📤 レスポンス返却:', createdBanner.rows[0]);

    return NextResponse.json(
      {
        message: 'バナーを作成しました',
        banner: createdBanner.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('バナー作成エラー:', error);
    return NextResponse.json(
      { error: 'バナーの作成に失敗しました' },
      { status: 500 }
    );
  }
}
