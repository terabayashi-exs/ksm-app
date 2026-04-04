// components/features/my/TeamManagersClient.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCog, Mail, Clock, LogOut, ChevronRight, Home } from "lucide-react";
import Link from "next/link";

interface TeamManager {
  login_user_id: number;
  email: string;
  display_name: string;
}

interface TeamInvitation {
  id: number;
  invited_email: string;
  status: string;
}

interface TeamManagersClientProps {
  teamId: string;
  teamName: string;
  teamOmission: string | null;
}

export default function TeamManagersClient({ teamId, teamName, teamOmission }: TeamManagersClientProps) {
  const router = useRouter();
  const [managers, setManagers] = useState<TeamManager[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchManagers = async () => {
    try {
      const [managersRes, invitationsRes] = await Promise.all([
        fetch(`/api/my/teams/${teamId}/managers`),
        fetch(`/api/my/teams/invite?team_id=${teamId}`)
      ]);

      if (managersRes.ok) {
        const managersData = await managersRes.json();
        if (managersData.success) {
          setManagers(managersData.data);
        }
      }

      if (invitationsRes.ok) {
        const invitationsData = await invitationsRes.json();
        if (invitationsData.success) {
          setInvitations(invitationsData.data.filter((inv: TeamInvitation) => inv.status === 'pending'));
        }
      }
    } catch (err) {
      console.error("担当者データ取得エラー:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManagers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || inviting) return;

    setInviting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/my/teams/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, invited_email: inviteEmail.trim() })
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: '招待メールを送信しました' });
        setInviteEmail("");
        await fetchManagers();
      } else {
        setMessage({ type: 'error', text: data.error || '招待に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '招待に失敗しました' });
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (invitationId: number) => {
    if (cancelling) return;

    setCancelling(invitationId);
    setMessage(null);

    try {
      const res = await fetch(`/api/my/teams/invite`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitation_id: invitationId })
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: '招待を取り消しました' });
        await fetchManagers();
      } else {
        setMessage({ type: 'error', text: data.error || '取消に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '取消に失敗しました' });
    } finally {
      setCancelling(null);
    }
  };

  const handleLeaveTeam = async (loginUserId: number) => {
    const managerCount = managers.length;
    let confirmMessage: string;

    if (managerCount === 1) {
      confirmMessage = `チーム「${teamName}」の紐づけを解除します。\n\nチームID：${teamId}\n\n再度このチームの担当者となる場合は、上記チームIDを控えておき「チームIDで紐づける」から操作が必要です。\n\n紐づけを解除してもよろしいですか？`;
    } else {
      confirmMessage = `チーム「${teamName}」から脱退しますか？`;
    }

    if (!confirm(confirmMessage)) return;

    setLeaving(loginUserId);
    setMessage(null);

    try {
      const res = await fetch(`/api/my/teams/${teamId}/leave`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginUserId })
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: data.message || '脱退しました' });

        // 脱退後はマイダッシュボードのチーム管理タブに戻る
        setTimeout(() => {
          router.refresh();
          router.push("/my?tab=team");
        }, 1500);
      } else {
        setMessage({ type: 'error', text: data.error || '脱退に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '脱退に失敗しました' });
    } finally {
      setLeaving(null);
    }
  };

  const canInvite = managers.length < 2 && invitations.length === 0;

  return (
    <div>
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-2xl font-bold text-white">チーム代表者管理</h1>
            <p className="text-sm text-white/70 mt-1">
              チームの代表者の招待・管理を行います
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"><Home className="h-3.5 w-3.5" /><span>Home</span></Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=team" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">マイダッシュボード</Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">チーム代表者管理</span>
        </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {teamName}{teamOmission && `（${teamOmission}）`}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {message && (
            <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
            </div>
          ) : (
            <>
              {/* 担当者一覧 */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">現在の担当者</h3>
                <div className="space-y-2">
                  {managers.map(m => (
                    <div key={m.login_user_id} className="flex items-center justify-between gap-3 p-4 bg-gray-50/40 rounded-lg">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <UserCog className="w-6 h-6 text-green-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-medium truncate">{m.display_name}</div>
                          <div className="text-sm text-gray-500 truncate">{m.email}</div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleLeaveTeam(m.login_user_id)}
                        disabled={leaving === m.login_user_id}
                        className="border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50 flex-shrink-0"
                      >
                        <LogOut className="w-4 h-4 mr-1" />
                        {leaving === m.login_user_id ? '処理中...' : '脱退'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 招待中 */}
              {invitations.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">招待中</h3>
                  <div className="space-y-2">
                    {invitations.map(inv => (
                      <div key={inv.id} className="flex items-center justify-between p-4 bg-amber-50/60 rounded-lg border border-amber-200">
                        <div className="flex items-center gap-3 min-w-0">
                          <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{inv.invited_email}</div>
                            <div className="text-sm text-gray-500">承認待ち</div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCancelInvite(inv.id)}
                          disabled={cancelling === inv.id}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          {cancelling === inv.id ? '処理中...' : '取消'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 招待フォーム */}
              {canInvite && (
                <div className="space-y-3 pt-4 border-t">
                  <h3 className="text-lg font-semibold">2人目の担当者を招待</h3>
                  <p className="text-sm text-gray-500">
                    招待したいユーザーのメールアドレスを入力してください。招待メールが送信されます。
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      autoComplete="off"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="メールアドレス"
                      onKeyDown={e => e.key === 'Enter' && handleInvite()}
                      disabled={inviting}
                    />
                    <Button
                      onClick={handleInvite}
                      disabled={inviting || !inviteEmail.trim()}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      {inviting ? '送信中...' : '招待'}
                    </Button>
                  </div>
                </div>
              )}

              {!canInvite && managers.length < 2 && invitations.length > 0 && (
                <p className="text-sm text-gray-500 pt-4 border-t">
                  承認待ちの招待があります。承認されるか、取り消されるまで新しい招待はできません。
                </p>
              )}

              {managers.length >= 2 && (
                <p className="text-sm text-gray-500 pt-4 border-t">
                  担当者は最大2名までです。
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
