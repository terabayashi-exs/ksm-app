// scripts/test-api-recalculate-standings.mjs
// 順位表再計算APIの進出条件チェック機能をテストするスクリプト

import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env.local') });

async function testRecalculateStandingsAPI() {
  const tournamentId = 75;

  try {
    console.log('=== 順位表再計算API テスト ===\n');
    console.log(`大会ID: ${tournamentId}`);
    console.log('APIエンドポイント: POST /api/tournaments/75/recalculate-standings\n');

    console.log('注意: このスクリプトは実際のAPIを呼び出しません。');
    console.log('実際のテストは以下の手順で実行してください:\n');

    console.log('1. 開発サーバーを起動:');
    console.log('   npm run dev\n');

    console.log('2. ブラウザで以下のURLにアクセス:');
    console.log('   http://localhost:3000/admin/tournaments/75/manual-rankings\n');

    console.log('3. 「順位表再計算」ボタンをクリック\n');

    console.log('4. レスポンスに以下の情報が含まれることを確認:');
    console.log('   - promotion_validation.checked: true');
    console.log('   - promotion_validation.is_valid: true (正常な場合)');
    console.log('   - promotion_validation.issues_found: 0 (正常な場合)');
    console.log('   - promotion_validation.auto_fixed: 0 (正常な場合)\n');

    console.log('期待されるレスポンス形式:');
    const expectedResponse = {
      success: true,
      message: '順位表の再計算が完了しました（成功: X件, エラー: 0件, スキップ: Y件）',
      tournament_name: '小学3年生の部',
      results: [],
      summary: {
        total_blocks: 0,
        success: 0,
        error: 0,
        skipped: 0
      },
      promotion_validation: {
        checked: true,
        is_valid: true,
        issues_found: 0,
        auto_fixed: 0,
        fix_failed: 0,
        details: {
          isValid: true,
          totalMatches: 45,
          checkedMatches: 45,
          issues: [],
          summary: {
            errorCount: 0,
            warningCount: 0,
            placeholderCount: 0
          }
        }
      }
    };

    console.log(JSON.stringify(expectedResponse, null, 2));

    console.log('\n=== テスト手順（cURL使用） ===\n');
    console.log('開発サーバー起動後、以下のコマンドでAPIを直接テスト可能:\n');

    console.log('# 1. ログインしてセッションクッキーを取得');
    console.log('curl -c cookies.txt -X POST http://localhost:3000/api/auth/callback/credentials \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{"email":"admin@example.com","password":"admin123"}\'\n');

    console.log('# 2. 順位表再計算APIを実行');
    console.log('curl -b cookies.txt -X POST http://localhost:3000/api/tournaments/75/recalculate-standings \\');
    console.log('  -H "Content-Type: application/json" | jq .\n');

    console.log('✅ このテストスクリプトは参考情報を表示しました。');
    console.log('実際のテストは上記の手順に従って手動で実行してください。');

  } catch (error) {
    console.error('エラー:', error);
  }
}

testRecalculateStandingsAPI();
