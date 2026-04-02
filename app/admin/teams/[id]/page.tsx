'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Trash2, AlertCircle, CheckCircle, ChevronRight, Home } from 'lucide-react';
import Header from '@/components/layout/Header';

interface Manager {
  login_user_id: number;
  member_id: number;
  display_name: string;
  email: string;
  member_role: string;
  joined_at: string;
}

interface TeamInfo {
  team_id: string;
  team_name: string;
}

export default function AdminTeamManagerPage() {
  const params = useParams();
  const teamId = params.id as string;

  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/transfer-owner`);
      const result = await res.json();
      if (result.success) {
        setTeam(result.team);
        setManagers(result.managers);
      }
    } catch (err) {
      console.error('データ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const handleRemoveManager = async (loginUserId: number, displayName: string) => {
    if (!confirm(`「${displayName}」を担当者から削除しますか？`)) return;
    setProcessing(loginUserId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/transfer-owner`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_user_id: loginUserId }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: `「${displayName}」を担当者から削除しました` });
        await fetchData();
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch {
      setMessage({ type: 'error', text: '処理に失敗しました' });
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            マイダッシュボード
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/admin/administrators" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            利用者マスタ管理
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            チーム担当者管理
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            チーム担当者管理
          </h1>
          {team && (
            <p className="text-sm text-gray-500 mt-1">{team.team_name}</p>
          )}
        </div>

        {message && (
          <div className={`flex items-start gap-2 p-4 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-destructive/5 border border-destructive/20 text-destructive'
          }`}>
            {message.type === 'success'
              ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5" />
              担当者一覧（{managers.length} / 2名）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {managers.length === 0 ? (
              <p className="text-sm text-gray-500">担当者が登録されていません</p>
            ) : (
              managers.map((manager) => (
                <div key={manager.login_user_id}
                  className="flex items-center justify-between p-4 bg-gray-50/40 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{manager.display_name}</span>
                      </div>
                      <div className="text-sm text-gray-500">{manager.email}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/30 text-destructive hover:border-destructive/40 hover:bg-destructive/5"
                      onClick={() => handleRemoveManager(manager.login_user_id, manager.display_name)}
                      disabled={processing === manager.login_user_id || managers.length <= 1}
                      title={managers.length <= 1 ? '最後の担当者は削除できません' : '担当者から削除'}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      削除
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2 text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">操作の注意事項</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>担当者が1名の場合は削除できません。</li>
                  <li>担当者を削除すると、そのユーザーはこのチームにアクセスできなくなります。</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
