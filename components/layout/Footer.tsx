// components/layout/Footer.tsx
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-secondary/50 border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          {/* システム情報 */}
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="relative w-10 h-10">
                <Image
                  src="/images/system_logo.png"
                  alt="楽勝 GO"
                  width={40}
                  height={40}
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">楽勝 GO</h3>
                <p className="text-sm text-muted-foreground">Sports Tournament Management System</p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm mb-4 max-w-2xl mx-auto">
              あらゆるスポーツ大会の運営を効率化する総合的な管理システムです。
              大会の作成から結果の公開まで、一元的に管理できます。
            </p>
            <div className="text-sm text-muted-foreground">
              <span>© 2024 楽勝 GO</span>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            このシステムは大会運営の効率化を目的として開発されました。
            <br />
            ご質問やサポートが必要な場合は、管理者にお問い合わせください。
          </p>
        </div>
      </div>
    </footer>
  );
}