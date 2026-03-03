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
  ArrowLeft
} from 'lucide-react';
import Link from 'next/link';

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
  contact_person: string;
  contact_email: string;
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
  contact_person: string;
  contact_email: string;
  contact_phone?: string;
  registration_type: 'self_registered' | 'admin_proxy';
  player_count: number;
  created_at: string;
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
    contact_person: '',
    contact_email: '',
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
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 管理者用APIから大会情報と参加チーム一覧を取得
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

    if (tournamentId) {
      fetchData();
    }
  }, [tournamentId]);

  // 仮パスワード生成
  const generateTemporaryPassword = (): string => {
    const prefix = 'temp';
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${suffix}`;
  };

  // 手動登録フォームの処理
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const tempPassword = generateTemporaryPassword();
      const teamData = { 
        ...manualForm,
        tournament_team_name: manualForm.team_name, // 大会参加チーム名として同じ値を使用
        tournament_team_omission: manualForm.team_omission, // 大会参加チーム略称として同じ値を使用
        temporary_password: tempPassword,
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
        // 成功時: 既存チーム一覧に追加
        const newExistingTeam: TeamData = {
          tournament_team_id: result.data.tournament_team_id,
          team_id: result.data.team_id,
          team_name: result.data.tournament_team_name,
          team_omission: teamData.tournament_team_omission,
          master_team_name: result.data.team_name,
          contact_person: teamData.contact_person,
          contact_email: teamData.contact_email,
          contact_phone: teamData.contact_phone,
          registration_type: 'admin_proxy', // 管理者代行登録として設定
          player_count: teamData.players.length,
          created_at: new Date().toISOString()
        };
        setExistingTeams(prev => [...prev, newExistingTeam]);
        
        // フォームリセット
        setManualForm({
          team_name: '',
          team_omission: '',
          contact_person: '',
          contact_email: '',
          contact_phone: '',
          tournament_team_name: '',
          tournament_team_omission: '',
          players: []
        });

        const passwordInfo = result.data.is_existing_team
          ? '既存のパスワードを使用'
          : `${tempPassword}`;
        const passwordNote = result.data.is_existing_team
          ? ''
          : '\n\n※代表者には初回ログイン時のパスワード変更をお願いしてください。';

        alert(`チーム「${result.data.team_name}」の管理者代行登録が完了しました。\n\n【重要】以下の情報をチーム代表者にお伝えください：\n\n- ログインID: ${result.data.team_id}\n- パスワード: ${passwordInfo}\n- メールアドレス: ${result.data.contact_email}${passwordNote}`);
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

  // CSV テンプレートダウンロード（マルチ行形式）
  const downloadCsvTemplate = () => {
    const template = [
      // ヘッダー行
      '行種別,チーム名,略称,代表者名,メールアドレス,電話番号,選手名,背番号,ポジション',
      '',
      // サンプルチーム1
      'TEAM,サンプルFC,サンプル,山田太郎,yamada@example.com,090-1234-5678,,,',
      'PLAYER,,,,,,田中一郎,1,GK',
      'PLAYER,,,,,,佐藤次郎,2,DF', 
      'PLAYER,,,,,,鈴木三郎,3,MF',
      'PLAYER,,,,,,高橋四郎,,FW',
      '',
      // サンプルチーム2
      'TEAM,テストユナイテッド,テスト,鈴木花子,suzuki@example.com,080-9876-5432,,,',
      'PLAYER,,,,,,中村太一,10,GK',
      'PLAYER,,,,,,小林次郎,11,DF',
      'PLAYER,,,,,,伊藤三郎,,MF',
      '',
      // 空のチーム（入力用）
      'TEAM,,,,,,,,',
      'PLAYER,,,,,,,',
      'PLAYER,,,,,,,',
      'PLAYER,,,,,,,',
      '',
      // 使用方法の説明（コメント行として）
      '# 使用方法:',
      '# 1. TEAM行: チーム基本情報を入力（選手名・背番号・ポジションは空欄）',
      '# 2. PLAYER行: 選手情報を入力（チーム名・代表者情報は空欄）',
      '# 3. 背番号・ポジションは任意項目（空欄可）',
      '# 4. 電話番号は任意項目',
      '# 5. 選手なしでもチーム登録可能（TEAM行のみでOK）',
      '# 6. 1チームにつき最大20人まで選手登録可能',
      '# 7. #で始まる行は無視されます'
    ].join('\n');

    // BOMを追加してExcelでの文字化けを防ぐ
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'team_registration_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
          
          // 9列必要（行種別,チーム名,略称,代表者名,メール,電話,選手名,背番号,ポジション）
          if (columns.length < 9) {
            errors.push(`行${actualLineNumber}: 列数が不足しています（${columns.length}列 < 9列）→${line}`);
            continue;
          }

          // カラムの前後の空白を除去
          const [rowType, teamName, teamOmission, contactPerson, contactEmail, contactPhone, playerName, jerseyNumber, position] = columns.map(col => col.trim());

          if (rowType === 'TEAM') {
            // 前のチームを保存
            if (currentTeam && currentTeam.team_name) {
              teams.push(currentTeam);
            }

            // 新しいチーム開始
            currentTeam = {
              team_name: teamName || '',
              team_omission: teamOmission || '',
              contact_person: contactPerson || '',
              contact_email: contactEmail || '',
              contact_phone: contactPhone || '',
              players: [],
              tournament_team_name: teamName || '', // 同じ値を使用
              tournament_team_omission: teamOmission || '' // 同じ値を使用
            };

            // チーム情報のバリデーション
            if (!teamName) errors.push(`行${actualLineNumber}: チーム名が必須です`);
            if (!teamOmission) errors.push(`行${actualLineNumber}: チーム略称が必須です`);
            if (!contactPerson) errors.push(`行${actualLineNumber}: 代表者名が必須です`);
            if (!contactEmail) errors.push(`行${actualLineNumber}: メールアドレスが必須です`);
            if (contactEmail && !contactEmail.includes('@')) {
              errors.push(`行${actualLineNumber}: 有効なメールアドレスを入力してください`);
            }

          } else if (rowType === 'PLAYER') {
            if (!currentTeam) {
              errors.push(`行${actualLineNumber}: PLAYER行の前にTEAM行が必要です`);
              continue;
            }

            if (playerName) {
              const player: Player = {
                player_name: playerName,
                uniform_number: jerseyNumber ? parseInt(jerseyNumber) : undefined,
                position: position || ''
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
          if (team.players.length > 20) {
            errors.push(`チーム「${team.team_name}」: 選手は最大20人までです（現在${team.players.length}人）`);
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
        const tempPassword = generateTemporaryPassword();
        const teamData = {
          ...team,
          temporary_password: tempPassword
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
              teamOmission: team.team_omission,
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
              tempPassword: result.data.temporary_password || tempPassword,
              isExistingTeam: result.data.is_existing_team
            });
          } else {
            results.push({
              success: false,
              teamName: team.team_name,
              teamOmission: team.team_omission,
              error: result.error
            });
          }
        } catch (error) {
          results.push({
            success: false,
            teamName: team.team_name,
            teamOmission: team.team_omission,
            error: error instanceof Error ? error.message : 'API呼び出しエラー'
          });
        }
      }

      // 結果の集計
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      // 結果レポート表示（リロード前に表示）
      let message = `CSV一括登録完了\n\n成功: ${successCount}チーム\n失敗: ${failureCount}チーム`;

      if (failureCount > 0) {
        message += '\n\n【失敗したチーム】\n';
        results
          .filter(r => !r.success)
          .forEach(r => {
            message += `- ${r.teamName} (${r.teamOmission}): ${r.error}\n`;
          });
        message += '\n※チーム名または略称が既に使用されている場合は、CSVファイルで異なる名称に変更してください。';
      }

      if (successCount > 0) {
        message += '\n\n【重要】以下の情報をチーム代表者にお伝えください:\n';
        results
          .filter(r => r.success)
          .forEach(r => {
            message += `\n[${r.teamName}]\n`;
            message += `ログインID: ${r.teamId}\n`;
            if (r.isExistingTeam) {
              message += `パスワード: 既存のパスワードを使用\n`;
            } else {
              message += `仮パスワード: ${r.tempPassword}\n`;
            }
          });
      }

      // alertを先に表示（ユーザーがOKを押すまで待機）
      alert(message);

      // ユーザーがOKを押した後にページリロード
      if (successCount > 0) {
        window.location.reload();
      }
      
      // 成功時はフォームリセット
      if (successCount > 0) {
        setCsvFile(null);
        setCsvPreview([]);
        setCsvErrors([]);
        // ファイル入力もリセット
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">大会情報が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
              <h1 className="text-3xl font-bold text-white">チーム登録（管理者代行）</h1>
              <p className="text-sm text-white/70 mt-1">
                「{tournament.tournament_name}」のチーム登録を管理者が代行します
              </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/my?tab=admin">
              <ArrowLeft className="h-4 w-4 mr-1" />
              ダッシュボードに戻る
            </Link>
          </Button>
        </div>

        {/* パスワード管理についての注意書き */}
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <Key className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-primary mb-1">パスワード管理について</h3>
                <p className="text-sm text-primary">
                  管理者代行でのチーム登録では、仮パスワードが自動生成されます。
                  登録完了後に表示される仮パスワードを、チーム代表者にお伝えください。
                  チーム代表者は初回ログイン時にパスワード変更が必要です。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* タブ切り替え */}
        <div className="flex space-x-2 mb-6 border-b border-border">
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-4 py-3 text-base font-medium border-b-2 transition-colors ${
              activeTab === 'manual'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            手動登録
          </button>
          <button
            onClick={() => setActiveTab('csv')}
            className={`flex items-center gap-2 px-4 py-3 text-base font-medium border-b-2 transition-colors ${
              activeTab === 'csv'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="team_name">チーム名 *</Label>
                        <Input
                          id="team_name"
                          value={manualForm.team_name}
                          onChange={(e) => setManualForm(prev => ({ ...prev, team_name: e.target.value }))}
                          required
                          placeholder="例: サンプルFC"
                        />
                      </div>
                      <div>
                        <Label htmlFor="team_omission">チーム略称</Label>
                        <Input
                          id="team_omission"
                          value={manualForm.team_omission}
                          onChange={(e) => setManualForm(prev => ({ ...prev, team_omission: e.target.value }))}
                          placeholder="例: サンプル"
                        />
                      </div>
                    </div>

                    {/* 連絡先情報 */}
                    <div className="border-t pt-6">
                    <div className="space-y-4">
                      <h3 className="font-medium">代表者・連絡先情報</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="contact_person">代表者名 *</Label>
                          <Input
                            id="contact_person"
                            value={manualForm.contact_person}
                            onChange={(e) => setManualForm(prev => ({ ...prev, contact_person: e.target.value }))}
                            required
                            placeholder="例: 山田太郎"
                          />
                        </div>
                        <div>
                          <Label htmlFor="contact_email">メールアドレス *</Label>
                          <Input
                            id="contact_email"
                            type="email"
                            value={manualForm.contact_email}
                            onChange={(e) => setManualForm(prev => ({ ...prev, contact_email: e.target.value }))}
                            required
                            placeholder="例: yamada@example.com"
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
                        <p className="text-muted-foreground text-center py-4 border-2 border-dashed border-muted rounded-lg">
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
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <Label htmlFor={`player_name_${index}`}>選手名 *</Label>
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
                            <div>
                              <Label htmlFor={`position_${index}`}>ポジション</Label>
                              <Input
                                id={`position_${index}`}
                                value={player.position}
                                onChange={(e) => {
                                  const newPlayers = [...manualForm.players];
                                  newPlayers[index].position = e.target.value;
                                  setManualForm(prev => ({ ...prev, players: newPlayers }));
                                }}
                                placeholder="例: GK, DF, MF, FW"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    </div>

                    <div className="flex justify-end space-x-4">
                      <Button type="button" variant="outline" onClick={() => router.push('/admin')}>
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
                        <Button variant="outline" onClick={downloadCsvTemplate} size="sm">
                          <Download className="w-4 h-4 mr-2" />
                          CSVテンプレートをダウンロード
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* CSVファイルアップロード */}
                  <div className="p-4 border-2 border-dashed border-muted rounded-lg">
                    <div className="text-center">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                      <h3 className="text-lg font-medium text-foreground mb-2">2. CSVファイルをアップロード</h3>
                      <p className="text-muted-foreground mb-4">
                        入力済みのCSVファイルをアップロードしてください
                      </p>
                      <div className="flex flex-col items-center space-y-3">
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleCsvFileSelect}
                          className="block w-full text-sm text-muted-foreground
                                   file:mr-4 file:py-2 file:px-4
                                   file:rounded-md file:border-0
                                   file:text-sm file:font-medium
                                   file:bg-blue-50 file:text-blue-700
                                   hover:file:bg-blue-100"
                        />
                        {csvFile && (
                          <p className="text-sm text-muted-foreground">
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
                            <p className="text-sm text-gray-600">代表者: {team.contact_person}</p>
                            <p className="text-sm text-gray-600">メール: {team.contact_email}</p>
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
                  <p className="text-muted-foreground text-center py-4">
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
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">略称: {team.team_omission}</p>
                          <p className="text-sm text-muted-foreground">マスター: {team.master_team_name}</p>
                          <p className="text-sm text-muted-foreground">代表者: {team.contact_person}</p>
                          <p className="text-sm text-muted-foreground">選手数: {team.player_count}名</p>
                          <p className="text-sm text-muted-foreground">登録日: {new Date(team.created_at).toLocaleDateString('ja-JP')}</p>
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