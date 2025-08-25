// components/layout/Footer.tsx

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          {/* システム情報 */}
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-2 rounded-lg shadow-md">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* トーナメント構造を表現 */}
                  <path 
                    d="M4 6h4v2H4V6zM4 16h4v2H4v-2zM16 6h4v2h-4V6zM16 16h4v2h-4v-2z" 
                    fill="currentColor" 
                    opacity="0.8"
                  />
                  {/* 中央の接続線 */}
                  <path 
                    d="M8 7h4v1H8V7zM8 17h4v-1H8v1zM12 8v8h1V8h-1z" 
                    fill="currentColor"
                  />
                  {/* 勝者の表現（星） */}
                  <path 
                    d="M12 2l1.09 3.26L16 5l-2.91 1.74L14 10l-2-1.2L10 10l.91-3.26L8 5l2.91.26L12 2z" 
                    fill="#FFD700" 
                    opacity="0.9"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold">Rakusyo GO</h3>
                <p className="text-sm text-gray-400">Sports Tournament Management System</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-4 max-w-2xl mx-auto">
              あらゆるスポーツ大会の運営を効率化する総合的な管理システムです。
              大会の作成から結果の公開まで、一元的に管理できます。
            </p>
            <div className="text-sm text-gray-400">
              <span>© 2024 Rakusyo GO</span>
            </div>
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