"use client";

import { Check, Copy, ExternalLink, QrCode } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function QRCodeContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url");
  const title = searchParams.get("title") || "";
  const [copied, setCopied] = useState(false);

  if (!url) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-gray-500">URLが指定されていません</p>
            <Button onClick={() => window.close()} className="mt-4">
              閉じる
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  return (
    <div className="min-h-screen bg-white p-4">
      <div className="max-w-md mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <QrCode className="w-5 h-5 text-primary" />
              QRコード
            </CardTitle>
          </CardHeader>
          <CardContent>
            {title && (
              <p className="text-base font-semibold text-gray-900 text-center mb-4">{title}</p>
            )}

            {/* QRコード表示 */}
            <div className="text-center mb-6">
              <div className="inline-block p-4 bg-white rounded-lg shadow-inner border border-gray-100">
                <Image
                  src={qrCodeImageUrl}
                  alt="QRコード"
                  width={256}
                  height={256}
                  className="mx-auto"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
                <div className="w-64 h-64 mx-auto bg-gray-50 rounded-lg items-center justify-center text-gray-500 hidden">
                  <div className="text-center">
                    <QrCode className="w-12 h-12 mx-auto mb-2" />
                    <p className="text-sm">QRコードを読み込めませんでした</p>
                  </div>
                </div>
              </div>
            </div>

            {/* URL表示 */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500 mb-1">URL</p>
              <p className="text-sm text-gray-700 break-all select-all">{url}</p>
            </div>

            {/* アクションボタン */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={copyToClipboard} className="flex-1">
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-1.5 text-green-600" /> コピー済み
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1.5" /> URLをコピー
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => window.open(url, "_blank")}>
                <ExternalLink className="w-4 h-4 mr-1.5" />
                開く
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.close()}
            className="text-gray-500"
          >
            ウィンドウを閉じる
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function QRCodePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            <p className="mt-3 text-sm text-gray-500">QRコード生成中...</p>
          </div>
        </div>
      }
    >
      <QRCodeContent />
    </Suspense>
  );
}
