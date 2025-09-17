'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Info, XCircle, X } from 'lucide-react';
import Link from 'next/link';

interface TournamentNotification {
  notification_id: number;
  tournament_id: number;
  notification_type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  is_resolved: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  tournament_name: string;
}

interface NotificationBannerProps {
  refreshInterval?: number; // 自動更新間隔（ミリ秒）
}

export default function NotificationBanner({ refreshInterval = 30000 }: NotificationBannerProps) {
  const [notifications, setNotifications] = useState<TournamentNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // 通知を取得
  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/admin/notifications', { cache: 'no-store' });
      const result = await response.json();
      
      if (result.success) {
        setNotifications(result.data);
      }
    } catch (error) {
      console.error('通知取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  // 通知を解決済みにする
  const resolveNotification = async (notificationId: number) => {
    try {
      const response = await fetch(`/api/admin/notifications/${notificationId}/resolve`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setNotifications(prev => prev.filter(n => n.notification_id !== notificationId));
      }
    } catch (error) {
      console.error('通知解決エラー:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    
    // 定期更新
    const interval = setInterval(fetchNotifications, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  // 通知アイコン
  const getNotificationIcon = (severity: string) => {
    switch (severity) {
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  // 通知の背景色
  const getNotificationBgColor = (severity: string) => {
    switch (severity) {
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  if (loading) {
    return null;
  }

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mb-6">
      <h3 className="text-lg font-medium text-foreground flex items-center">
        <AlertTriangle className="w-5 h-5 mr-2 text-yellow-600" />
        要対応事項 ({notifications.length}件)
      </h3>
      
      {notifications.map((notification) => (
        <Card key={notification.notification_id} className={`${getNotificationBgColor(notification.severity)} border`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                {getNotificationIcon(notification.severity)}
                <div className="flex-1">
                  <h4 className="font-medium text-foreground">{notification.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                  <div className="flex items-center space-x-4 mt-3">
                    <span className="text-xs text-muted-foreground">
                      {notification.tournament_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(notification.created_at).toLocaleString('ja-JP')}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 ml-4">
                {notification.notification_type === 'manual_ranking_needed' && notification.metadata && (
                  <Button asChild size="sm" variant="outline" className="border-blue-500 text-blue-700 hover:bg-blue-50">
                    <Link href={`/admin/tournaments/${notification.tournament_id}/manual-rankings`}>
                      順位設定
                    </Link>
                  </Button>
                )}
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => resolveNotification(notification.notification_id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}