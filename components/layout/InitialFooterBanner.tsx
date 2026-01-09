'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

/**
 * 初期表示時のみ表示される固定フッターバナー
 * スクロールを開始すると自動的に非表示になる
 */
export default function InitialFooterBanner() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      // スクロールが発生したら非表示にする
      if (window.scrollY > 50) {
        setIsVisible(false);
      }
    };

    // 少し遅延を入れてスクロールイベントを監視
    const debouncedHandleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScroll, 10);
    };

    window.addEventListener('scroll', debouncedHandleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', debouncedHandleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg z-40 transition-all duration-500 ease-in-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
      }`}
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
          <span className="text-sm text-gray-600 font-medium">supported by</span>
          <a
            href="https://www.toyama-koueki.co.jp/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block transition-opacity hover:opacity-70"
          >
            <Image
              src="/images/kouekilogo.png"
              alt="富山交易株式会社"
              width={378}
              height={60}
              className="h-8 w-auto object-contain"
            />
          </a>
        </div>
      </div>
    </div>
  );
}
