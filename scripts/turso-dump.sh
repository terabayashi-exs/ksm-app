#!/bin/bash

# Turso データベースダンプスクリプト
# 本番データベースからデータをエクスポート

# 色付きメッセージ出力用の関数
print_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

print_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# 引数チェック
if [ "$#" -ne 2 ]; then
    print_error "使用方法: $0 <database-url> <auth-token>"
    echo "例: $0 'libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io' 'your-auth-token'"
    exit 1
fi

DATABASE_URL=$1
AUTH_TOKEN=$2
DUMP_FILE="turso-dump-$(date +%Y%m%d_%H%M%S).sql"

print_info "Tursoデータベースからデータをダンプします..."
print_info "データベース: $DATABASE_URL"
print_info "出力ファイル: $DUMP_FILE"

# Turso CLI がインストールされているか確認
if ! command -v turso &> /dev/null; then
    print_error "Turso CLI がインストールされていません。"
    echo "インストール方法: curl -sSfL https://get.tur.so/install.sh | bash"
    exit 1
fi

# SQLite3がインストールされているか確認
if ! command -v sqlite3 &> /dev/null; then
    print_error "sqlite3 がインストールされていません。"
    echo "インストール方法: sudo apt-get install sqlite3 (Ubuntu/Debian)"
    exit 1
fi

# 一時ディレクトリを作成
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Node.jsスクリプトを作成してデータを取得
cat > "$TEMP_DIR/export-data.js" << 'EOF'
const { createClient } = require('@libsql/client');
const fs = require('fs');

const databaseUrl = process.argv[2];
const authToken = process.argv[3];
const outputFile = process.argv[4];

const client = createClient({
  url: databaseUrl,
  authToken: authToken,
});

async function exportDatabase() {
  try {
    console.log('テーブル一覧を取得中...');
    const tables = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name;
    `);

    let sqlDump = `-- Turso Database Dump
-- Generated at: ${new Date().toISOString()}
-- Database: ${databaseUrl}

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

`;

    for (const table of tables.rows) {
      const tableName = table[0];
      console.log(`テーブル ${tableName} をエクスポート中...`);

      // テーブル構造を取得
      const tableInfo = await client.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}';`);
      if (tableInfo.rows.length > 0) {
        sqlDump += `-- Table: ${tableName}\n`;
        sqlDump += `DROP TABLE IF EXISTS ${tableName};\n`;
        sqlDump += tableInfo.rows[0][0] + ';\n\n';
      }

      // データを取得
      const data = await client.execute(`SELECT * FROM ${tableName};`);
      if (data.rows.length > 0) {
        for (const row of data.rows) {
          const values = row.map(value => {
            if (value === null) return 'NULL';
            if (typeof value === 'string') {
              return `'${value.replace(/'/g, "''")}'`;
            }
            return value;
          }).join(', ');
          
          const columns = data.columns.map(col => col).join(', ');
          sqlDump += `INSERT INTO ${tableName} (${columns}) VALUES (${values});\n`;
        }
        sqlDump += '\n';
      }
    }

    sqlDump += `COMMIT;
PRAGMA foreign_keys=ON;
`;

    fs.writeFileSync(outputFile, sqlDump);
    console.log(`ダンプが完了しました: ${outputFile}`);
    console.log(`エクスポートされたテーブル数: ${tables.rows.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('エラーが発生しました:', error.message);
    process.exit(1);
  }
}

exportDatabase();
EOF

# Node.jsでダンプを実行
print_info "データベースをエクスポート中..."
cd "$TEMP_DIR"
npm init -y > /dev/null 2>&1
npm install @libsql/client > /dev/null 2>&1

if node export-data.js "$DATABASE_URL" "$AUTH_TOKEN" "$DUMP_FILE"; then
    # ダンプファイルを現在のディレクトリにコピー
    cp "$DUMP_FILE" "$OLDPWD/$DUMP_FILE"
    cd "$OLDPWD"
    
    print_success "ダンプが完了しました！"
    print_info "ダンプファイル: $DUMP_FILE"
    print_info "ファイルサイズ: $(du -h $DUMP_FILE | cut -f1)"
    
    # 簡単な検証
    if grep -q "INSERT INTO" "$DUMP_FILE"; then
        print_success "ダンプファイルにデータが含まれています。"
        echo ""
        echo "次のステップ:"
        echo "1. このファイルを確認: cat $DUMP_FILE | head -50"
        echo "2. 開発環境にリストア: ./scripts/restore-database.js $DUMP_FILE"
    else
        print_error "ダンプファイルにデータが含まれていない可能性があります。"
    fi
else
    print_error "ダンプ処理中にエラーが発生しました。"
    exit 1
fi