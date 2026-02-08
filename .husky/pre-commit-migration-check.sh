#!/bin/bash
# マイグレーション関連ファイルが変更された場合、MIGRATION_HISTORY.mdの更新をチェック

# スキーマファイルまたはマイグレーションスクリプトが変更されているか確認
SCHEMA_CHANGED=$(git diff --cached --name-only | grep -E "(src/db/schema.ts|scripts/.*migration.*\.mjs)")
HISTORY_CHANGED=$(git diff --cached --name-only | grep "MIGRATION_HISTORY.md")

if [ -n "$SCHEMA_CHANGED" ] && [ -z "$HISTORY_CHANGED" ]; then
  echo "⚠️  警告: データベーススキーマが変更されていますが、MIGRATION_HISTORY.mdが更新されていません。"
  echo ""
  echo "変更されたファイル:"
  echo "$SCHEMA_CHANGED"
  echo ""
  echo "MIGRATION_HISTORY.mdを更新してください。"
  echo ""
  echo "それでもコミットする場合: git commit --no-verify"
  exit 1
fi
