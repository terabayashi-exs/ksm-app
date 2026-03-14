// app/api/admin/tournaments/[id]/teams/csv-template/route.ts
// CSVテンプレートをサーバーサイドで生成してダウンロードさせる
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(_request: NextRequest) {
  // 認証チェック（管理者または運営者権限必須）
  const session = await auth();
  if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
    return NextResponse.json(
      { success: false, error: '管理者権限が必要です' },
      { status: 401 }
    );
  }

  const template = [
    // ヘッダー行
    '行種別,チーム名,略称,電話番号,選手名,背番号',
    '',
    // サンプルチーム1
    'TEAM,サンプルFC,サンプル,090-1234-5678,,',
    'PLAYER,,,,田中一郎,1',
    'PLAYER,,,,佐藤次郎,2',
    'PLAYER,,,,鈴木三郎,3',
    'PLAYER,,,,高橋四郎,',
    '',
    // サンプルチーム2
    'TEAM,テストユナイテッド,テスト,080-9876-5432,,',
    'PLAYER,,,,中村太一,10',
    'PLAYER,,,,小林次郎,11',
    'PLAYER,,,,伊藤三郎,',
    '',
    // 空のチーム（入力用）
    'TEAM,,,,,',
    'PLAYER,,,,,',
    'PLAYER,,,,,',
    'PLAYER,,,,,',
    '',
    // 使用方法の説明（コメント行として）
    '# 使用方法:',
    '# 1. TEAM行: チーム基本情報を入力（選手名・背番号は空欄）',
    '# 2. PLAYER行: 選手情報を入力（チーム名・電話番号は空欄）',
    '# 3. 背番号・電話番号は任意項目（空欄可）',
    '# 4. 選手なしでもチーム登録可能（TEAM行のみでOK）',
    '# 5. 1チームにつき最大20人まで選手登録可能',
    '# 6. #で始まる行は無視されます',
  ].join('\n');

  // BOM + CSV本文
  const bom = '\uFEFF';
  const body = bom + template;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="team_registration_template.csv"',
    },
  });
}
