// components/features/my/TeamPlayersClient.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Save, ArrowLeft, Users } from "lucide-react";
import Link from "next/link";

interface Player {
  player_id: number;
  player_name: string;
  jersey_number: number | null;
}

interface FormPlayer {
  player_name: string;
  jersey_number: string;
}

interface TeamPlayersClientProps {
  teamId: string;
  teamName: string;
  teamOmission: string | null;
}

export default function TeamPlayersClient({ teamId, teamName, teamOmission }: TeamPlayersClientProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [formPlayers, setFormPlayers] = useState<FormPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchPlayers = async () => {
    try {
      const res = await fetch(`/api/my/teams/${teamId}/players`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPlayers(data.data);
          setFormPlayers(data.data.map((p: Player) => ({
            player_name: p.player_name,
            jersey_number: p.jersey_number != null ? String(p.jersey_number) : ''
          })));
        }
      }
    } catch (err) {
      console.error("選手データ取得エラー:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const handleSavePlayers = async () => {
    const validPlayers = formPlayers.filter(p => p.player_name.trim());

    if (validPlayers.length === 0) {
      setMessage({ type: 'error', text: '選手名を入力してください' });
      return;
    }

    // 背番号の重複チェック
    const jerseyNumbers = validPlayers
      .map(p => p.jersey_number.trim())
      .filter(n => n !== '');

    const uniqueJerseyNumbers = new Set(jerseyNumbers);
    if (jerseyNumbers.length !== uniqueJerseyNumbers.size) {
      setMessage({ type: 'error', text: '背番号が重複しています' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/my/teams/${teamId}/players`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          players: validPlayers.map(p => ({
            player_name: p.player_name.trim(),
            jersey_number: p.jersey_number.trim() ? parseInt(p.jersey_number) : null
          }))
        })
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: '選手情報を保存しました' });
        await fetchPlayers();
      } else {
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  const addPlayer = () => {
    if (formPlayers.length >= 20) {
      setMessage({ type: 'error', text: '選手は最大20名までです' });
      return;
    }
    setFormPlayers(prev => [...prev, { player_name: '', jersey_number: '' }]);
  };

  const removePlayer = (index: number) => {
    setFormPlayers(prev => prev.filter((_, i) => i !== index));
  };

  const updatePlayer = (index: number, field: 'player_name' | 'jersey_number', value: string) => {
    setFormPlayers(prev => prev.map((p, i) =>
      i === index ? { ...p, [field]: value } : p
    ));
  };

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Button asChild variant="outline" size="sm">
          <Link href="/my?tab=team">
            <ArrowLeft className="w-4 h-4 mr-2" />
            戻る
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            選手管理
          </CardTitle>
          <p className="text-sm text-gray-500">
            {teamName}{teamOmission && `（${teamOmission}）`}
          </p>
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
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <span className="font-medium">登録選手：{players.length}名</span>
                </div>
                <span className="text-sm text-gray-500">
                  （最大20名まで）
                </span>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_100px_40px] gap-2 text-sm font-medium text-gray-500 px-1">
                  <span>選手名 <span className="text-red-500">*</span></span>
                  <span>背番号</span>
                  <span></span>
                </div>

                {formPlayers.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_100px_40px] gap-2 items-center">
                    <Input
                      value={p.player_name}
                      onChange={e => updatePlayer(idx, 'player_name', e.target.value)}
                      placeholder="例: 山田太郎"
                      maxLength={50}
                      lang="ja"
                    />
                    <Input
                      type="number"
                      value={p.jersey_number}
                      onChange={e => updatePlayer(idx, 'jersey_number', e.target.value)}
                      placeholder="—"
                      min={1}
                      max={99}
                      className="text-center"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePlayer(idx)}
                      className="text-gray-500 hover:text-red-500 hover:bg-red-50 p-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                {formPlayers.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>選手が登録されていません</p>
                    <p className="text-sm mt-1">「選手を追加」ボタンから登録してください</p>
                  </div>
                )}

                {formPlayers.length < 20 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={addPlayer}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    選手を追加
                  </Button>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={handleSavePlayers}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? '保存中...' : '保存'}
                </Button>
                <Button
                  asChild
                  variant="outline"
                  disabled={saving}
                >
                  <Link href="/my?tab=team">
                    キャンセル
                  </Link>
                </Button>
              </div>

              <div className="text-sm text-gray-500 space-y-1 pt-4 border-t">
                <p>• 選手名は必須項目です</p>
                <p>• 背番号は任意です（1〜99の範囲で設定できます）</p>
                <p>• 背番号を設定する場合は、重複しないようにしてください</p>
                <p>• 最大20名まで登録できます</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
