# 結果表PDFファイル配置ディレクトリ

このディレクトリには、各大会の結果表PDFファイルを配置します。

## ファイル名規則

```
tournament-{大会ID}-results.pdf
```

### 例
- 大会ID 9の場合: `tournament-9-results.pdf`
- 大会ID 15の場合: `tournament-15-results.pdf`

## 使用方法

1. 手動で作成した結果表PDFファイルをこのディレクトリに配置
2. 大会詳細ページ（概要タブ）に自動的にダウンロードリンクが表示される
3. ユーザーは「結果表（PDF版）」からPDFを表示・ダウンロード可能

## 注意事項

- ファイル名は必ず上記の規則に従ってください
- PDFファイルが存在しない場合、リンクは表示されますがエラーとなります
- 最新情報はシステム内の「順位表」「戦績表」機能をご確認ください

## サンプルファイル

実際の運用時には、このディレクトリに以下のようなファイルが配置されます：

```
tournament-results/
├── README.md (このファイル)
├── tournament-9-results.pdf
├── tournament-10-results.pdf
└── tournament-11-results.pdf
```