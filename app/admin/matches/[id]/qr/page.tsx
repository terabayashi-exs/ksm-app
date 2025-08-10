'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, Copy, ExternalLink, Clock, Users } from 'lucide-react';

interface QRData {
  match_id: number;
  match_code: string;
  team1_name: string;
  team2_name: string;
  court_number: number;
  scheduled_time: string;
  qr_url: string;
  token: string;
  valid_from: string;
  valid_until: string;
}

export default function MatchQRCodePage() {
  const params = useParams();
  const matchId = params.id as string;
  
  const [qrData, setQRData] = useState<QRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchQRData = async () => {
      try {
        const response = await fetch(`/api/matches/${matchId}/qr`);
        const result = await response.json();
        
        if (result.success) {
          setQRData(result.data);
        } else {
          setError(result.error || 'QRコードの取得に失敗しました');
        }
      } catch (err) {
        setError('サーバーとの通信に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    if (matchId) {
      fetchQRData();
    }
  }, [matchId]);

  const copyToClipboard = async () => {
    if (qrData?.qr_url) {
      try {
        await navigator.clipboard.writeText(qrData.qr_url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Copy failed:', err);
      }
    }
  };

  const openInNewTab = () => {
    if (qrData?.qr_url) {
      // 同じタブで開く（デバッグのため）
      window.location.href = qrData.qr_url;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">QRコード生成中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={() => window.close()}>閉じる</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!qrData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-gray-600">QRコードデータが見つかりません</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // QRコード生成用のURL（外部サービスを使用）
  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData.qr_url)}`;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* ヘッダー */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-3">
              <QrCode className="w-6 h-6 text-blue-600" />
              <span>審判用QRコード - {qrData.match_code}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-4">
              <div className="text-xl font-bold text-gray-800 mb-2">
                {qrData.team1_name} vs {qrData.team2_name}
              </div>
              <div className="flex items-center justify-center space-x-4 text-sm text-gray-600">
                <div className="flex items-center">
                  <Users className="w-4 h-4 mr-1" />
                  コート{qrData.court_number}
                </div>
                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  {qrData.scheduled_time}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* QRコード表示 */}
        <Card className="mb-6">
          <CardContent className="p-8">
            <div className="text-center">
              <div className="inline-block p-4 bg-white rounded-lg shadow-inner">
                <img 
                  src={qrCodeImageUrl} 
                  alt="QRコード"
                  className="w-72 h-72 mx-auto"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'block';
                  }}
                />
                <div 
                  className="w-72 h-72 mx-auto bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 hidden"
                >
                  <div className="text-center">
                    <QrCode className="w-16 h-16 mx-auto mb-2" />
                    <p>QRコード画像を読み込めませんでした</p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-gray-600">
                審判の方はこのQRコードをスキャンして結果入力画面にアクセスしてください
              </p>
            </div>
          </CardContent>
        </Card>

        {/* アクション */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-center space-x-4">
              <Button
                variant="outline"
                onClick={copyToClipboard}
                className="flex items-center space-x-2"
              >
                <Copy className="w-4 h-4" />
                <span>{copied ? 'コピー済み!' : 'URLをコピー'}</span>
              </Button>
              
              <Button
                variant="outline"
                onClick={openInNewTab}
                className="flex items-center space-x-2"
              >
                <ExternalLink className="w-4 h-4" />
                <span>直接アクセス</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 有効期限情報 */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium text-gray-700 mb-2">アクセス情報</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>• 有効期間: {new Date(qrData.valid_from).toLocaleString('ja-JP')} ～ {new Date(qrData.valid_until).toLocaleString('ja-JP')}</p>
              <p>• 試合開始30分前から終了90分後まで有効</p>
              <p>• QRコードまたはURLから審判用結果入力画面にアクセスできます</p>
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-4 p-2 bg-gray-100 rounded text-xs break-all">
                  <strong>Debug URL:</strong> {qrData.qr_url}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}