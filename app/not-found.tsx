import { Home, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import BackButton from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-hero-gradient flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* ロゴ */}
        <div className="mb-8">
          <Image
            src="/images/taikaigo-logo-main.svg"
            alt="大会GO"
            width={300}
            height={106}
            className="mx-auto w-full h-auto max-w-[240px] sm:max-w-[300px]"
            style={{ objectFit: "contain" }}
            priority
          />
        </div>

        {/* 404メッセージ */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-8 sm:p-10">
          <p className="text-6xl font-bold text-primary mb-3">404</p>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
            ページが見つかりません
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-8">
            お探しのページは移動または削除された可能性があります。
            <br />
            大会GOトップページから大会を検索できます。
          </p>

          {/* ボタン */}
          <div className="flex flex-col gap-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                トップページへ
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full">
              <Link href="/#search">
                <Search className="mr-2 h-4 w-4" />
                大会を検索する
              </Link>
            </Button>
            <BackButton className="text-gray-400 hover:text-gray-600 mt-2">
              前のページに戻る
            </BackButton>
          </div>
        </div>

        <p className="text-xs text-white/60 mt-8">&copy; 大会GO - スポーツ大会管理システム</p>
      </div>
    </div>
  );
}
