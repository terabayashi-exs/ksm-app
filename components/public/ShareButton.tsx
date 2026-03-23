'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Share2, Copy, Check, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Brand icons (lucide-react doesn't include brand icons)
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function LineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

interface ShareButtonProps {
  tournamentName: string;
}

export default function ShareButton({ tournamentName }: ShareButtonProps) {
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState('');

  function getFullUrl() {
    return `${window.location.origin}${pathname}`;
  }

  function handleShareX() {
    const url = getFullUrl();
    const text = encodeURIComponent(`${tournamentName} の結果をチェック！`);
    const encodedUrl = encodeURIComponent(url);
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}`,
      '_blank',
      'width=550,height=420'
    );
  }

  function handleShareFacebook() {
    const url = getFullUrl();
    const encodedUrl = encodeURIComponent(url);
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      '_blank',
      'width=550,height=420'
    );
  }

  function handleShareLine() {
    const url = getFullUrl();
    const encodedUrl = encodeURIComponent(url);
    window.open(
      `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`,
      '_blank',
      'width=550,height=420'
    );
  }

  function handleShowQR() {
    const url = getFullUrl();
    setQrUrl(url);
    // DropdownMenuが完全に閉じてからDialogを開く
    setTimeout(() => setQrOpen(true), 100);
  }

  async function handleCopyLink() {
    const url = getFullUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="シェア">
            <Share2 className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>シェア</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleShowQR}>
            <QrCode className="h-4 w-4 mr-2" />
            QRコードを表示
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleShareX}>
            <XIcon className="h-4 w-4 mr-2" />
            X でシェア
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShareFacebook}>
            <FacebookIcon className="h-4 w-4 mr-2" />
            Facebook でシェア
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShareLine}>
            <LineIcon className="h-4 w-4 mr-2" />
            LINE でシェア
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCopyLink}>
            {copied ? (
              <Check className="h-4 w-4 mr-2 text-green-600" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            リンクをコピー
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* QRコードダイアログ */}
      <Dialog open={qrOpen} onOpenChange={(open) => {
        setQrOpen(open);
        if (!open) {
          // Radix UIのportal競合でbodyのpointer-eventsが残る問題を回避
          setTimeout(() => {
            document.body.style.pointerEvents = '';
          }, 100);
        }
      }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-5 w-5 text-primary" />
              QRコード
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-gray-500 text-center">
              このQRコードを読み取ると、このページを開けます
            </p>
            {qrUrl && (
              <Image
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrUrl)}`}
                alt="QRコード"
                width={250}
                height={250}
                className="rounded-lg"
                unoptimized
              />
            )}
            <p className="text-xs text-gray-400 break-all text-center max-w-full">
              {qrUrl}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
