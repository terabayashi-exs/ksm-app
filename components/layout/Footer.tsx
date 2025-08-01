// components/layout/Footer.tsx
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* システム情報 */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <div className="bg-blue-600 text-white p-2 rounded-lg">
                <span className="font-bold text-lg">PK</span>
              </div>
              <div>
                <h3 className="text-lg font-bold">PK選手権大会システム</h3>
                <p className="text-sm text-gray-400">Tournament Management System</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              PK選手権大会の運営を効率化するための総合的な管理システムです。
              大会の作成から結果の公開まで、一元的に管理できます。
            </p>
            <div className="flex space-x-4 text-sm text-gray-400">
              <span>© 2024 PK Tournament System</span>
            </div>
          </div>

          {/* クイックリンク */}
          <div>
            <h4 className="text-lg font-semibold mb-4">クイックリンク</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/public/tournaments" className="text-gray-400 hover:text-white transition-colors">
                  大会一覧
                </Link>
              </li>
              <li>
                <Link href="/auth/login" className="text-gray-400 hover:text-white transition-colors">
                  ログイン
                </Link>
              </li>
              <li>
                <Link href="/auth/register" className="text-gray-400 hover:text-white transition-colors">
                  チーム登録
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-gray-400 hover:text-white transition-colors">
                  システムについて
                </Link>
              </li>
            </ul>
          </div>

          {/* 管理者向け */}
          <div>
            <h4 className="text-lg font-semibold mb-4">管理者向け</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/admin" className="text-gray-400 hover:text-white transition-colors">
                  管理者ダッシュボード
                </Link>
              </li>
              <li>
                <Link href="/admin/tournaments/create" className="text-gray-400 hover:text-white transition-colors">
                  新規大会作成
                </Link>
              </li>
              <li>
                <Link href="/admin/teams" className="text-gray-400 hover:text-white transition-colors">
                  チーム管理
                </Link>
              </li>
              <li>
                <Link href="/admin/results" className="text-gray-400 hover:text-white transition-colors">
                  結果管理
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center">
          <p className="text-sm text-gray-400">
            このシステムは大会運営の効率化を目的として開発されました。
            <br />
            ご質問やサポートが必要な場合は、管理者にお問い合わせください。
          </p>
        </div>
      </div>
    </footer>
  );
}