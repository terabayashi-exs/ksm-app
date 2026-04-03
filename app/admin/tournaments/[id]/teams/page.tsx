'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import { Textarea } from '@/components/ui/textarea';
import {
  Users,
  Upload,
  UserPlus,
  Download,
  AlertCircle,
  FileText,
  Key,
  Trash2,
  Lock,
  ChevronRight,
  Home
} from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/layout/Header';

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  format_name: string;
  venue_name: string;
  team_count: number;
}

interface TeamRegistration {
  team_name: string;
  team_omission: string;
  contact_phone: string;
  tournament_team_name: string;
  tournament_team_omission: string;
  players: Player[];
  temporary_password?: string;
  team_id?: string;
}

interface Player {
  player_name: string;
  uniform_number?: number;
  position: string;
}

interface TeamData {
  tournament_team_id: number;
  team_id: string;
  team_name: string;
  team_omission: string;
  master_team_name: string;
  contact_phone?: string;
  registration_type: 'self_registered' | 'admin_proxy';
  player_count: number;
  created_at: string;
  has_matches?: boolean;
}

export default function TeamRegistrationPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'manual' | 'csv'>('manual');
  const [existingTeams, setExistingTeams] = useState<TeamData[]>([]);

  // 手動登録用の状態
  const [manualForm, setManualForm] = useState<TeamRegistration>({
    team_name: '',
    team_omission: '',
    contact_phone: '',
    tournament_team_name: '',
    tournament_team_omission: '',
    players: []
  });

  // CSV登録用の状態
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<TeamRegistration[]>([]);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);

  // 大会情報と既存参加チーム取得
  const fetchData = async () => {
    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/teams`);

      if (!response.ok) {
        console.error('データ取得エラー:', `HTTPエラー: ${response.status}`);
        return;
      }

      const result = await response.json();

      if (result.success) {
        setTournament(result.data.tournament);
        setExistingTeams(result.data.teams);
      } else {
        console.error('データ取得エラー:', result.error);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tournamentId) {
      fetchData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  // 手動登録フォームの処理
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const teamData = {
        team_name: manualForm.team_name,
        team_omission: manualForm.team_omission,
        contact_phone: manualForm.contact_phone,
        tournament_team_name: manualForm.team_name,
        tournament_team_omission: manualForm.team_omission,
        players: manualForm.players.map(p => ({
          player_name: p.player_name,
          uniform_number: p.uniform_number,
          position: p.position || ''
        }))
      };

      // API呼び出し
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(teamData),
      });

      if (!response.ok) {
        let errorMessage = `HTTPエラー: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // JSONパースに失敗した場合はHTTPステータスのみ
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result.success) {
        // フォームリセット
        setManualForm({
          team_name: '',
          team_omission: '',
          contact_phone: '',
          tournament_team_name: '',
          tournament_team_omission: '',
          players: []
        });

        // チーム一覧を再取得して即反映
        await fetchData();
      } else {
        throw new Error(result.error || '登録に失敗しました');
      }
    } catch (error) {
      console.error('Team registration error:', error);
      alert(`チーム登録に失敗しました。\n\n${error instanceof Error ? error.message : 'エラーが発生しました'}`);  
    }
  };

  // 選手追加
  const addPlayer = () => {
    setManualForm(prev => ({
      ...prev,
      players: [...prev.players, { player_name: '', uniform_number: undefined, position: '' }]
    }));
  };

  // 選手削除
  const removePlayer = (index: number) => {
    setManualForm(prev => ({
      ...prev,
      players: prev.players.filter((_, i) => i !== index)
    }));
  };

  // CSVテンプレートダウンロードURL（サーバーサイドAPI経由）
  const csvTemplateUrl = `/api/admin/tournaments/${tournamentId}/teams/csv-template`;

  // CSVファイル解析
  const parseCsvFile = async (file: File): Promise<{ teams: TeamRegistration[], errors: string[] }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const allLines = text.split('\n').map(line => line.trim());
        
        // ヘッダー行をスキップし、空行とコメント行を除外
        const lines = allLines
          .slice(1) // 最初の行（ヘッダー）をスキップ
          .filter(line => line && !line.startsWith('#'));
        
        const teams: TeamRegistration[] = [];
        const errors: string[] = [];
        let currentTeam: TeamRegistration | null = null;
        let actualLineNumber = 1; // ヘッダーを除いた実際の行番号

        for (const line of lines) {
          actualLineNumber++;
          
          // カンマで分割（末尾の空カラムも考慮）
          const columns = line.split(',');
          
          // 6列必要（行種別,チーム名,略称,電話番号,選手名,背番号）
          if (columns.length < 6) {
            errors.push(`行${actualLineNumber}: 列数が不足しています（${columns.length}列 < 6列）→${line}`);
            continue;
          }

          // カラムの前後の空白を除去
          const [rowType, teamName, teamOmission, contactPhone, playerName, jerseyNumber] = columns.map(col => col.trim());

          if (rowType === 'TEAM') {
            // 前のチームを保存
            if (currentTeam && currentTeam.team_name) {
              teams.push(currentTeam);
            }

            // 新しいチーム開始
            currentTeam = {
              team_name: teamName || '',
              team_omission: teamOmission || '',
              contact_phone: contactPhone || '',
              players: [],
              tournament_team_name: teamName || '', // 同じ値を使用
              tournament_team_omission: teamOmission || '' // 同じ値を使用
            };

            // チーム情報のバリデーション
            if (!teamName) errors.push(`行${actualLineNumber}: チーム名が必須です`);
            if (!teamOmission) errors.push(`行${actualLineNumber}: チーム略称が必須です`);

          } else if (rowType === 'PLAYER') {
            if (!currentTeam) {
              errors.push(`行${actualLineNumber}: PLAYER行の前にTEAM行が必要です`);
              continue;
            }

            if (playerName) {
              const player: Player = {
                player_name: playerName,
                uniform_number: jerseyNumber ? parseInt(jerseyNumber) : undefined,
                position: ''
              };

              // 背番号のバリデーション
              if (jerseyNumber && (isNaN(parseInt(jerseyNumber)) || parseInt(jerseyNumber) < 1 || parseInt(jerseyNumber) > 99)) {
                errors.push(`行${actualLineNumber}: 背番号は1-99の数値で入力してください`);
              }

              currentTeam.players.push(player);
            }
          } else {
            errors.push(`行${actualLineNumber}: 不明な行種別「${rowType}」です（TEAM または PLAYER を指定してください）`);
          }
        }

        // 最後のチームを保存
        if (currentTeam && currentTeam.team_name) {
          teams.push(currentTeam);
        }

        // 最終バリデーション
        teams.forEach((team) => {
          if (team.players.length > 30) {
            errors.push(`チーム「${team.team_name}」: 選手は最大30人までです（現在${team.players.length}人）`);
          }

          // 背番号重複チェック
          const jerseyNumbers = team.players.filter(p => p.uniform_number !== undefined).map(p => p.uniform_number);
          const uniqueNumbers = new Set(jerseyNumbers);
          if (jerseyNumbers.length !== uniqueNumbers.size) {
            errors.push(`チーム「${team.team_name}」: 背番号が重複しています`);
          }
        });

        resolve({ teams, errors });
      };
      
      reader.readAsText(file, 'UTF-8');
    });
  };

  // CSVファイル選択時の処理
  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setCsvErrors([]);
    setCsvPreview([]);

    try {
      const { teams, errors } = await parseCsvFile(file);
      setCsvPreview(teams);
      setCsvErrors(errors);
    } catch {
      setCsvErrors(['CSVファイルの読み込みに失敗しました']);
    }
  };

  // CSV一括登録処理
  const handleCsvSubmit = async () => {
    if (csvErrors.length > 0) {
      alert('エラーを修正してから登録してください');
      return;
    }

    if (csvPreview.length === 0) {
      alert('登録するチームがありません');
      return;
    }

    setCsvUploading(true);

    try {
      const results = [];
      
      for (const team of csvPreview) {
        const teamData = {
          ...team
        };

        try {
          const response = await fetch(`/api/admin/tournaments/${tournamentId}/teams`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(teamData),
          });

          // レスポンスが空でないか確認してからJSONをパース
          if (!response.ok) {
            // HTTPエラーの場合
            let errorMessage = `HTTPエラー: ${response.status}`;
            try {
              const errorData = await response.json();
              errorMessage = errorData.error || errorMessage;
            } catch {
              // JSONパースに失敗した場合はHTTPステータスのみ
            }
            results.push({
              success: false,
              teamName: team.team_name,
              teamId: '',
              isExistingTeam: false,
              error: errorMessage
            });
            continue;
          }

          const result = await response.json();

          if (result.success) {
            results.push({
              success: true,
              teamName: team.team_name,
              teamId: result.data.team_id,
              isExistingTeam: result.data.is_existing_team
            });
          } else {
            results.push({
              success: false,
              teamName: team.team_name,
              teamId: '',
              isExistingTeam: false,
              error: result.error
            });
          }
        } catch (error) {
          results.push({
            success: false,
            teamName: team.team_name,
            teamId: '',
            isExistingTeam: false,
            error: error instanceof Error ? error.message : 'API呼び出しエラー'
          });
        }
      }

      // 結果の集計
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      // 失敗があった場合のみ通知
      if (failureCount > 0) {
        let message = `成功: ${successCount}チーム / 失敗: ${failureCount}チーム\n\n【失敗したチーム】\n`;
        results
          .filter(r => !r.success)
          .forEach(r => {
            message += `- ${r.teamName}: ${r.error}\n`;
          });
        alert(message);
      }

      // フォームリセット
      setCsvFile(null);
      setCsvPreview([]);
      setCsvErrors([]);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // チーム一覧を再取得して即反映
      if (successCount > 0) {
        await fetchData();
      }

    } catch (error) {
      console.error('CSV bulk registration error:', error);
      alert('CSV一括登録中にエラーが発生しました');
    } finally {
      setCsvUploading(false);
    }
  };

  // チーム削除処理
  const handleDeleteTeam = async (team: TeamData) => {
    const teamName = team.team_name || team.master_team_name;
    
    if (!confirm(`チーム「${teamName}」を削除しますか？\n\n※この操作は取り消せません。関連する選手データもすべて削除されます。`)) {
      return;
    }

    setDeletingTeamId(team.team_id);

    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/teams/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tournamentTeamId: team.tournament_team_id }),
      });

      if (!response.ok) {
        let errorMessage = `HTTPエラー: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // JSONパースに失敗した場合はHTTPステータスのみ
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result.success) {
        // UI状態を更新（tournament_team_idで特定のエントリーのみ削除）
        setExistingTeams(prev => prev.filter(t => t.tournament_team_id !== team.tournament_team_id));
        alert(`チーム「${teamName}」を正常に削除しました。`);
      } else {
        throw new Error(result.error || 'チーム削除に失敗しました');
      }
    } catch (error) {
      console.error('Team deletion error:', error);
      alert(`チーム削除に失敗しました。\n\n${error instanceof Error ? error.message : 'エラーが発生しました'}`);
    } finally {
      setDeletingTeamId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500">大会情報が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"><Home className="h-3.5 w-3.5" /><span>Home</span></Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">マイダッシュボード</Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">チーム登録</span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">チーム登録</h1>
          <p className="text-sm text-gray-500 mt-1">
            「{tournament.tournament_name}」のチーム登録を行います
          </p>
        </div>

        {/* チームID紐付けについての注意書き */}
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <Key className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-primary mb-1">代行登録の流れ</h3>
                <p className="text-sm text-primary">
                  ここでチームを登録した後、参加チーム管理画面のメール送信機能を使って、
                  チーム代表者にアカウント登録とチームIDによる紐付けを案内してください。
                  代表者はメールのリンクをクリックすることでチームを自分のアカウントに紐付けることができます。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* タブ切り替え */}
        <div className="grid grid-cols-2 gap-1 mb-6">
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center justify-center gap-2 py-3 text-xs sm:text-sm font-medium rounded-md transition-colors ${
              activeTab === 'manual'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-50/80 hover:text-gray-900'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            手動登録
          </button>
          <button
            onClick={() => setActiveTab('csv')}
            className={`flex items-center justify-center gap-2 py-3 text-xs sm:text-sm font-medium rounded-md transition-colors ${
              activeTab === 'csv'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-50/80 hover:text-gray-900'
            }`}
          >
            <Upload className="w-4 h-4" />
            CSV一括登録
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {/* 手動登録タブ */}
            {activeTab === 'manual' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <UserPlus className="w-5 h-5 mr-2" />
                    手動でチーム登録
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleManualSubmit} className="space-y-6">
                    {/* チーム基本情報 */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="team_name">チーム名 <span className="text-destructive">*</span></Label>
                        <Input
                          id="team_name"
                          value={manualForm.team_name}
                          onChange={(e) => setManualForm(prev => ({ ...prev, team_name: e.target.value }))}
                          required
                          placeholder="例: サンプルFC"
                        />
                      </div>
                      <div>
                        <Label htmlFor="team_omission">チーム略称 <span className="text-destructive">*</span></Label>
                        <Input
                          id="team_omission"
                          value={manualForm.team_omission}
                          onChange={(e) => setManualForm(prev => ({ ...prev, team_omission: e.target.value }))}
                          required
                          placeholder="例: サンプル"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contact_phone">電話番号</Label>
                        <Input
                          id="contact_phone"
                          value={manualForm.contact_phone}
                          onChange={(e) => setManualForm(prev => ({ ...prev, contact_phone: e.target.value }))}
                          placeholder="例: 090-1234-5678"
                        />
                      </div>
                    </div>

                    {/* 選手登録 */}
                    <div className="border-t pt-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium">選手登録（任意）</h3>
                        <Button type="button" variant="outline" size="sm" onClick={addPlayer}>
                          <UserPlus className="w-4 h-4 mr-1" />
                          選手追加
                        </Button>
                      </div>
                      
                      {manualForm.players.length === 0 && (
                        <p className="text-gray-500 text-center py-4 border-2 border-dashed border-muted rounded-lg">
                          選手は後から追加することも可能です。「選手追加」ボタンで選手を登録してください。
                        </p>
                      )}
                      
                      {manualForm.players.map((player, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-medium text-sm">選手 {index + 1}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removePlayer(index)}
                            >
                              削除
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor={`player_name_${index}`}>選手名 <span className="text-destructive">*</span></Label>
                              <Input
                                id={`player_name_${index}`}
                                value={player.player_name}
                                onChange={(e) => {
                                  const newPlayers = [...manualForm.players];
                                  newPlayers[index].player_name = e.target.value;
                                  setManualForm(prev => ({ ...prev, players: newPlayers }));
                                }}
                                required
                                placeholder="例: 田中一郎"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`uniform_number_${index}`}>背番号</Label>
                              <Input
                                id={`uniform_number_${index}`}
                                type="number"
                                min="1"
                                max="99"
                                value={player.uniform_number || ''}
                                onChange={(e) => {
                                  const newPlayers = [...manualForm.players];
                                  const value = e.target.value;
                                  newPlayers[index].uniform_number = value ? parseInt(value) : undefined;
                                  setManualForm(prev => ({ ...prev, players: newPlayers }));
                                }}
                                placeholder="未設定の場合は空欄"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    </div>

                    <div className="flex justify-end space-x-4">
                      <Button type="button" variant="outline" onClick={() => router.push('/my?tab=admin')}>
                        キャンセル
                      </Button>
                      <Button type="submit" variant="outline" className="border-2 border-green-600 text-green-600 hover:bg-green-50 hover:border-green-700">
                        チーム登録
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* CSV一括登録タブ */}
            {activeTab === 'csv' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Upload className="w-5 h-5 mr-2" />
                    CSV一括登録
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* CSVテンプレートダウンロード */}
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <FileText className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="font-medium text-primary mb-2">1. CSVテンプレートをダウンロード</h3>
                        <p className="text-sm text-primary mb-3">
                          まず、CSVテンプレートをダウンロードして、チーム情報を入力してください。
                        </p>
                        <Button asChild variant="outline" size="sm">
                          <a href={csvTemplateUrl} download="team_registration_template.csv">
                            <Download className="w-4 h-4 mr-2" />
                            CSVテンプレートをダウンロード
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* CSVファイルアップロード */}
                  <div className="p-4 border-2 border-dashed border-muted rounded-lg">
                    <div className="text-center">
                      <Upload className="w-8 h-8 mx-auto text-gray-500 mb-3" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">2. CSVファイルをアップロード</h3>
                      <p className="text-gray-500 mb-4">
                        入力済みのCSVファイルをアップロードしてください
                      </p>
                      <div className="flex flex-col items-center space-y-3">
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleCsvFileSelect}
                          className="block w-full text-sm text-gray-500
                                   file:mr-4 file:py-2 file:px-4
                                   file:rounded-md file:border-0
                                   file:text-sm file:font-medium
                                   file:bg-blue-50 file:text-blue-700
                                   hover:file:bg-blue-100"
                        />
                        {csvFile && (
                          <p className="text-sm text-gray-500">
                            選択ファイル: {csvFile.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* エラー表示 */}
                  {csvErrors.length > 0 && (
                    <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
                      <div className="flex items-start space-x-3">
                        <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                        <div>
                          <h3 className="font-medium text-destructive mb-2">CSVファイルにエラーがあります</h3>
                          <ul className="text-sm text-destructive space-y-1">
                            {csvErrors.map((error, index) => (
                              <li key={index}>• {error}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* プレビュー表示 */}
                  {csvPreview.length > 0 && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <h3 className="font-medium text-green-900 mb-3">3. 登録プレビュー ({csvPreview.length}チーム)</h3>
                      <div className="space-y-3 max-h-60 overflow-y-auto">
                        {csvPreview.map((team, index) => (
                          <div key={index} className="p-3 bg-white border border-green-200 rounded">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-gray-900">{team.team_name} ({team.team_omission})</h4>
                              <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                                {team.players.length}人
                              </span>
                            </div>
                            {team.contact_phone && <p className="text-sm text-gray-600">電話番号: {team.contact_phone}</p>}
                            <div className="mt-2">
                              <p className="text-xs text-gray-500">
                                選手: {team.players.map(p => `${p.player_name}${p.uniform_number ? `(${p.uniform_number})` : ''}`).join(', ')}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {csvErrors.length === 0 && (
                        <div className="mt-4 flex justify-end">
                          <Button 
                            onClick={handleCsvSubmit}
                            disabled={csvUploading}
                            className="flex items-center"
                          >
                            {csvUploading ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                登録中...
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4 mr-2" />
                                {csvPreview.length}チームを一括登録
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* 参加チーム一覧 */}
          <div className="space-y-4">
            {/* 参加チーム一覧 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  参加チーム一覧 ({existingTeams.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {existingTeams.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    まだ参加申し込みされたチームはありません
                  </p>
                ) : (
                  <div className="space-y-3">
                    {existingTeams.map((team) => {
                      const isAdminProxy = team.registration_type === 'admin_proxy';
                      return (
                        <div 
                          key={team.tournament_team_id} 
                          className={`p-3 border rounded-lg ${
                            isAdminProxy 
                              ? 'bg-yellow-50 border-yellow-200' 
                              : 'bg-green-50 border-green-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className={`font-medium ${isAdminProxy ? 'text-yellow-900' : 'text-green-900'}`}>
                              {team.team_name}
                            </h4>
                            <div className="flex items-center space-x-2">
                              <span className={`text-xs px-2 py-1 rounded ${
                                isAdminProxy
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {isAdminProxy ? '管理者代行' : '申し込み済み'}
                              </span>
                              {isAdminProxy && (
                                team.has_matches ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled
                                    className="cursor-not-allowed opacity-50"
                                    title="組合せ作成済みのため削除できません"
                                  >
                                    <Lock className="w-3 h-3 mr-1" />
                                    削除不可
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteTeam(team)}
                                    disabled={deletingTeamId === team.team_id}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20"
                                  >
                                    {deletingTeamId === team.team_id ? (
                                      <>
                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600 mr-1"></div>
                                        削除中
                                      </>
                                    ) : (
                                      <>
                                        <Trash2 className="w-3 h-3 mr-1" />
                                        削除
                                      </>
                                    )}
                                  </Button>
                                )
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-gray-500">略称: {team.team_omission}</p>
                          <div className="flex items-center gap-1">
                            <p className="text-sm text-gray-500">ID: <code className="text-xs bg-gray-50 px-1 py-0.5 rounded select-all">{team.team_id}</code></p>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(team.team_id);
                                alert('チームIDをコピーしました');
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 underline"
                            >
                              コピー
                            </button>
                          </div>
                          <p className="text-sm text-gray-500">選手数: {team.player_count}名</p>
                          <p className="text-sm text-gray-500">登録日: {new Date(team.created_at).toLocaleDateString('ja-JP')}</p>
                          {isAdminProxy && (
                            <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded text-xs">
                              <p className="text-yellow-800">
                                💡 このチームは管理者により代行登録されました
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}