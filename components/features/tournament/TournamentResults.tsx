'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Users, Calendar, Target, Award, Hash, Medal, MessageSquare, Download } from 'lucide-react';
import { BlockResults, getResultColor } from '@/lib/match-results-calculator';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface TeamStanding {
  team_id: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
}

interface BlockStanding {
  match_block_id: number;
  phase: string;
  display_round_name: string;
  block_name: string;
  teams: TeamStanding[];
}

interface TournamentResultsProps {
  tournamentId: number;
}

export default function TournamentResults({ tournamentId }: TournamentResultsProps) {
  const [results, setResults] = useState<BlockResults[]>([]);
  const [standings, setStandings] = useState<BlockStanding[]>([]);
  const [tournamentName, setTournamentName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // 戦績表データと順位表データの取得
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // 戦績表データ、順位表データ、大会情報を並列取得
        const [resultsResponse, standingsResponse, tournamentResponse] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}/results`, { cache: 'no-store' }),
          fetch(`/api/tournaments/${tournamentId}/standings`, { cache: 'no-store' }),
          fetch(`/api/tournaments/${tournamentId}`, { cache: 'no-store' })
        ]);

        if (!resultsResponse.ok) {
          throw new Error(`Results API: HTTP ${resultsResponse.status}: ${resultsResponse.statusText}`);
        }

        if (!standingsResponse.ok) {
          throw new Error(`Standings API: HTTP ${standingsResponse.status}: ${standingsResponse.statusText}`);
        }

        if (!tournamentResponse.ok) {
          throw new Error(`Tournament API: HTTP ${tournamentResponse.status}: ${tournamentResponse.statusText}`);
        }

        const [resultsData, standingsData, tournamentData] = await Promise.all([
          resultsResponse.json(),
          standingsResponse.json(),
          tournamentResponse.json()
        ]);

        if (resultsData.success) {
          setResults(resultsData.data);
        } else {
          console.error('Results API Error:', resultsData);
          setError(resultsData.error || '戦績表データの取得に失敗しました');
          return;
        }

        if (standingsData.success) {
          setStandings(standingsData.data);
        } else {
          console.error('Standings API Error:', standingsData);
          // 順位表データが取得できなくても戦績表は表示する
          setStandings([]);
        }

        if (tournamentData.success && tournamentData.data) {
          setTournamentName(tournamentData.data.tournament_name || `大会${tournamentId}`);
        } else {
          console.error('Tournament API Error:', tournamentData);
          setTournamentName(`大会${tournamentId}`);
        }
      } catch (err) {
        console.error('データ取得エラー:', err);
        setError(`データの取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tournamentId]);

  // PDFダウンロード機能（ページ別生成方式）
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      // 動的インポートでjsPDFとhtml2canvasを読み込み
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ]);

      const pdf = new jsPDF('landscape', 'mm', 'a4'); // A4横向き
      const pageWidth = 297; // A4横向きの幅（mm）
      const pageHeight = 210; // A4横向きの高さ（mm）
      
      // 予選リーグのみをフィルタリング
      const preliminaryBlocks = results.filter(block => 
        isPreliminaryPhase(block.phase)
      );

      // 動的ページ分割ロジック
      const blocksPerPage = calculateBlocksPerPage(preliminaryBlocks);
      const pageGroups = [];
      
      for (let i = 0; i < preliminaryBlocks.length; i += blocksPerPage) {
        pageGroups.push(preliminaryBlocks.slice(i, i + blocksPerPage));
      }

      // デバッグ情報をコンソールに出力
      console.log(`[PDF Generation] ブロック数: ${preliminaryBlocks.length}, 1ページあたり: ${blocksPerPage}ブロック, ページ数: ${pageGroups.length}`);
      preliminaryBlocks.forEach((block, index) => {
        console.log(`[PDF Generation] ${block.block_name}ブロック: ${block.teams.length}チーム`);
      });

      // ページごとに生成
      for (let pageIndex = 0; pageIndex < pageGroups.length; pageIndex++) {
        const blocks = pageGroups[pageIndex];
        const isFirstPage = pageIndex === 0;
        
        if (pageIndex > 0) {
          pdf.addPage();
        }

        const pageHtml = isFirstPage 
          ? generatePage1HTML(blocks) 
          : generatePage2HTML(blocks);
        
        const pageElement = document.createElement('div');
        pageElement.innerHTML = pageHtml;
        pageElement.style.position = 'absolute';
        pageElement.style.left = '-9999px';
        pageElement.style.top = '0';
        pageElement.style.width = '1600px';
        document.body.appendChild(pageElement);

        const canvas = await html2canvas(pageElement, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
        document.body.removeChild(pageElement);
      }

      // 3ページ目: 凡例・説明
      pdf.addPage();
      const page3Html = generatePage3HTML();
      const page3Element = document.createElement('div');
      page3Element.innerHTML = page3Html;
      page3Element.style.position = 'absolute';
      page3Element.style.left = '-9999px';
      page3Element.style.top = '0';
      page3Element.style.width = '1600px';
      document.body.appendChild(page3Element);

      const canvas3 = await html2canvas(page3Element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      const imgData3 = canvas3.toDataURL('image/png');
      const imgWidth3 = pageWidth;
      const imgHeight3 = (canvas3.height * imgWidth3) / canvas3.width;
      
      pdf.addImage(imgData3, 'PNG', 0, 0, imgWidth3, Math.min(imgHeight3, pageHeight));
      document.body.removeChild(page3Element);

      // PDFをダウンロード
      const fileName = `戦績表_${tournamentName.replace(/[\/\\:*?"<>|]/g, '')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);

    } catch (error) {
      console.error('PDFダウンロードエラー:', error);
      alert('PDFのダウンロードに失敗しました。再度お試しください。');
    } finally {
      setDownloadingPdf(false);
    }
  };


  // テーブル列幅計算関数
  const getTableCellSizes = (teamCount: number) => {
    // チーム数に応じた列幅調整
    if (teamCount <= 4) {
      return {
        teamName: '130px',
        matchResult: '75px',
        rank: '65px',
        points: '65px',
        matches: '60px',
        wins: '55px',
        draws: '55px',
        losses: '55px',
        goalsFor: '60px',
        goalsAgainst: '60px',
        goalDiff: '70px'
      };
    } else if (teamCount === 5) {
      return {
        teamName: '120px',
        matchResult: '65px',
        rank: '60px',
        points: '60px',
        matches: '55px',
        wins: '50px',
        draws: '50px',
        losses: '50px',
        goalsFor: '55px',
        goalsAgainst: '55px',
        goalDiff: '65px'
      };
    } else {
      return {
        teamName: '110px',
        matchResult: '55px',
        rank: '55px',
        points: '55px',
        matches: '50px',
        wins: '45px',
        draws: '45px',
        losses: '45px',
        goalsFor: '50px',
        goalsAgainst: '50px',
        goalDiff: '60px'
      };
    }
  };

  // ページ容量計算関数
  const calculateBlocksPerPage = (blocks: any[]): number => {
    if (blocks.length === 0) return 2;
    
    // 最大チーム数を取得
    const maxTeams = Math.max(...blocks.map(block => block.teams.length));
    
    console.log(`[PDF Layout] 最大チーム数: ${maxTeams}`);
    
    // チーム数に基づく判定
    if (maxTeams <= 3) {
      // 3チーム以下：3ブロック/ページ（コンパクト）
      return 3;
    } else if (maxTeams === 4) {
      // 4チーム：2ブロック/ページ（標準）
      return 2;
    } else if (maxTeams === 5) {
      // 5チーム：2ブロック/ページ（ギリギリ）
      return 2;
    } else if (maxTeams >= 6) {
      // 6チーム以上：1ブロック/ページ（安全確保）
      return 1;
    }
    
    return 2; // デフォルト
  };

  // ページ別HTML生成関数
  const generatePage1HTML = (blocks: any[]): string => {
    return `
      <div style="font-family: Arial, sans-serif; padding: 40px 60px; background: white;">
        <div style="text-align: center; margin-bottom: 40px; border-bottom: 3px solid #2563EB; padding-bottom: 20px;">
          <h1 style="font-size: 42px; color: #1F2937; margin-bottom: 15px;">${tournamentName} 戦績表</h1>
        </div>
        ${blocks.map((block, index) => generateBlockHTML(block, index)).join('')}
      </div>
    `;
  };

  const generatePage2HTML = (blocks: any[]): string => {
    return `
      <div style="font-family: Arial, sans-serif; padding: 40px 60px; background: white;">
        ${blocks.map((block, index) => generateBlockHTML(block, index)).join('')}
      </div>
    `;
  };

  const generatePage3HTML = (): string => {
    return `
      <div style="font-family: Arial, sans-serif; padding: 40px 60px; background: white;">
        <div style="margin-top: 30px; padding: 20px; background: #F8FAFC; border-radius: 8px; border: 1px solid #E5E7EB;">
          <div style="font-weight: bold; margin-bottom: 18px; color: #374151; font-size: 22px;">凡例・説明</div>
          
          <!-- 2列レイアウト -->
          <div style="display: flex; gap: 40px; margin-bottom: 18px;">
            <!-- 左列: 表構成の説明と対戦結果の見方 -->
            <div style="flex: 1;">
              <!-- 表構成の説明 -->
              <div style="margin-bottom: 20px;">
                <div style="font-weight: 600; margin-bottom: 10px; color: #4B5563; font-size: 18px;">📊 表の構成</div>
                <div style="display: flex; gap: 20px; margin-bottom: 10px;">
                  <div style="display: flex; align-items: center; font-size: 16px;">
                    <div style="width: 24px; height: 24px; margin-right: 8px; border-radius: 4px; background: #F0FDF4; border: 1px solid #BBF7D0;"></div>
                    対戦結果
                  </div>
                  <div style="display: flex; align-items: center; font-size: 16px;">
                    <div style="width: 24px; height: 24px; margin-right: 8px; border-radius: 4px; background: #EBF8FF; border: 1px solid #BFDBFE;"></div>
                    順位表情報
                  </div>
                </div>
              </div>
              
              <!-- 対戦結果の凡例 -->
              <div>
                <div style="font-weight: 600; margin-bottom: 10px; color: #4B5563; font-size: 18px;">⚔️ 対戦結果の見方</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 10px;">
                  <div style="display: flex; align-items: center; font-size: 15px;">
                    <div style="width: 26px; height: 26px; margin-right: 8px; border-radius: 4px; border: 1px solid #D1D5DB; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; background-color: #D1FAE5; color: #065F46;">〇</div>
                    勝利
                  </div>
                  <div style="display: flex; align-items: center; font-size: 15px;">
                    <div style="width: 26px; height: 26px; margin-right: 8px; border-radius: 4px; border: 1px solid #D1D5DB; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; background-color: #FEE2E2; color: #991B1B;">●</div>
                    敗北
                  </div>
                  <div style="display: flex; align-items: center; font-size: 15px;">
                    <div style="width: 26px; height: 26px; margin-right: 8px; border-radius: 4px; border: 1px solid #D1D5DB; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; background-color: #DBEAFE; color: #1E40AF;">△</div>
                    引分
                  </div>
                  <div style="display: flex; align-items: center; font-size: 15px;">
                    <div style="width: 26px; height: 26px; margin-right: 8px; border-radius: 4px; border: 1px solid #D1D5DB; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; background-color: #F3F4F6; color: #374151;">A1</div>
                    未実施
                  </div>
                </div>
                <div style="font-size: 14px; color: #6B7280;">
                  ※ 縦軸のチームが横軸のチームに対する結果を表示
                </div>
              </div>
            </div>
            
            <!-- 右列: 順位決定ルール -->
            <div style="flex: 1;">
              <div style="font-weight: 600; margin-bottom: 10px; color: #4B5563; font-size: 18px;">🏆 順位決定ルール</div>
              <div style="font-size: 16px; color: #6B7280; line-height: 1.5;">
                1. 勝点（勝利3点、引分1点、敗北0点）<br>
                2. 総得点数　<br>
                3. 得失点差　<br>
                4. 直接対決　<br>
                5. 抽選
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  // ブロックHTML生成関数
  const generateBlockHTML = (block: any, index: number): string => {
    const blockStandings = getStandingsForBlock(block.match_block_id);
    const teamCount = block.teams.length;
    
    // チーム数に基づく列幅調整
    const cellSizes = getTableCellSizes(teamCount);
    
    return `
      <div style="margin-bottom: 40px;">
        <div style="display: flex; align-items: center; margin-bottom: 20px; padding: 15px; border-radius: 8px; background: #F8FAFC;">
          <div style="font-size: 26px; font-weight: bold; color: white; padding: 15px 25px; border-radius: 10px; margin-right: 25px; background: ${getBlockColorValue(block.block_name)};">
            ${block.display_round_name || `${block.phase} ${block.block_name}ブロック`}
          </div>
          <div style="font-size: 20px; color: #4B5563;">${block.teams.length}チーム参加</div>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; border: 2px solid #E5E7EB; margin-bottom: 20px; background: white;">
          <thead>
            <tr>
              <th style="border: 1px solid #D1D5DB; padding: 15px; background: #F3F4F6; font-weight: bold; text-align: left; width: ${cellSizes.teamName}; font-size: 16px;">チーム</th>
              ${block.teams.map(opponent => `
                <th style="border: 1px solid #D1D5DB; padding: 15px; background: #F0FDF4; font-weight: bold; text-align: center; width: ${cellSizes.matchResult}; font-size: 14px;">
                  ${(opponent.team_omission || opponent.team_name).substring(0, teamCount > 5 ? 4 : 6)}
                </th>
              `).join('')}
              <th style="border: 1px solid #D1D5DB; padding: 15px; background: #EBF8FF; font-weight: bold; text-align: center; width: ${cellSizes.rank}; font-size: 15px;">順位</th>
              <th style="border: 1px solid #D1D5DB; padding: 15px; background: #EBF8FF; font-weight: bold; text-align: center; width: ${cellSizes.points}; font-size: 15px;">勝点</th>
              <th style="border: 1px solid #D1D5DB; padding: 15px; background: #EBF8FF; font-weight: bold; text-align: center; width: ${cellSizes.matches}; font-size: 15px;">試合</th>
              <th style="border: 1px solid #D1D5DB; padding: 15px; background: #EBF8FF; font-weight: bold; text-align: center; width: ${cellSizes.wins}; font-size: 15px;">勝</th>
              <th style="border: 1px solid #D1D5DB; padding: 15px; background: #EBF8FF; font-weight: bold; text-align: center; width: ${cellSizes.draws}; font-size: 15px;">分</th>
              <th style="border: 1px solid #D1D5DB; padding: 15px; background: #EBF8FF; font-weight: bold; text-align: center; width: ${cellSizes.losses}; font-size: 15px;">敗</th>
              <th style="border: 1px solid #D1D5DB; padding: 15px; background: #EBF8FF; font-weight: bold; text-align: center; width: ${cellSizes.goalsFor}; font-size: 15px;">得点</th>
              <th style="border: 1px solid #D1D5DB; padding: 15px; background: #EBF8FF; font-weight: bold; text-align: center; width: ${cellSizes.goalsAgainst}; font-size: 15px;">失点</th>
              <th style="border: 1px solid #D1D5DB; padding: 15px; background: #EBF8FF; font-weight: bold; text-align: center; width: ${cellSizes.goalDiff}; font-size: 15px;">得失差</th>
            </tr>
          </thead>
          <tbody>
            ${block.teams.map(team => {
              const teamStanding = blockStandings.find(s => s.team_id === team.team_id);
              const positionIcon = teamStanding?.position === 1 ? '🏆' : 
                                 teamStanding?.position === 2 ? '🥈' : 
                                 teamStanding?.position === 3 ? '🥉' : '';
              const goalDiffColor = (teamStanding?.goal_difference || 0) > 0 ? '#059669' : 
                                   (teamStanding?.goal_difference || 0) < 0 ? '#DC2626' : '#4B5563';
              
              return `
                <tr>
                  <td style="border: 1px solid #D1D5DB; padding: 12px; background: #F9FAFB; font-weight: bold; text-align: left; font-size: 15px; width: ${cellSizes.teamName};">
                    ${(team.team_omission || team.team_name).substring(0, teamCount > 5 ? 8 : 12)}
                  </td>
                  ${block.teams.map(opponent => {
                    if (team.team_id === opponent.team_id) {
                      return `<td style="border: 1px solid #D1D5DB; padding: 10px; background: #9CA3AF; color: #FFFFFF; text-align: center; font-weight: bold; font-size: 15px; width: ${cellSizes.matchResult};">-</td>`;
                    }
                    
                    const matchData = block.match_matrix[team.team_id]?.[opponent.team_id];
                    const result = matchData?.result || null;
                    const score = matchData?.score || '-';
                    const backgroundColor = getResultBackgroundColor(result, score);
                    
                    return `
                      <td style="border: 1px solid #D1D5DB; padding: 10px; background-color: ${backgroundColor}; text-align: center; font-weight: bold; font-size: 14px; width: ${cellSizes.matchResult};">
                        ${score}
                      </td>
                    `;
                  }).join('')}
                  <!-- 順位 -->
                  <td style="border: 1px solid #D1D5DB; padding: 10px; background: #EBF8FF; text-align: center; font-weight: bold; font-size: 15px; width: ${cellSizes.rank};">
                    ${positionIcon}${teamStanding?.position || '-'}
                  </td>
                  <!-- 勝点 -->
                  <td style="border: 1px solid #D1D5DB; padding: 10px; background: #EBF8FF; text-align: center; font-weight: bold; color: #2563EB; font-size: 15px; width: ${cellSizes.points};">
                    ${teamStanding?.points || 0}
                  </td>
                  <!-- 試合数 -->
                  <td style="border: 1px solid #D1D5DB; padding: 10px; background: #EBF8FF; text-align: center; font-size: 14px; width: ${cellSizes.matches};">
                    ${teamStanding?.matches_played || 0}
                  </td>
                  <!-- 勝利 -->
                  <td style="border: 1px solid #D1D5DB; padding: 10px; background: #EBF8FF; text-align: center; color: #059669; font-weight: 500; font-size: 14px; width: ${cellSizes.wins};">
                    ${teamStanding?.wins || 0}
                  </td>
                  <!-- 引分 -->
                  <td style="border: 1px solid #D1D5DB; padding: 10px; background: #EBF8FF; text-align: center; color: #D97706; font-weight: 500; font-size: 14px; width: ${cellSizes.draws};">
                    ${teamStanding?.draws || 0}
                  </td>
                  <!-- 敗北 -->
                  <td style="border: 1px solid #D1D5DB; padding: 10px; background: #EBF8FF; text-align: center; color: #DC2626; font-weight: 500; font-size: 14px; width: ${cellSizes.losses};">
                    ${teamStanding?.losses || 0}
                  </td>
                  <!-- 得点 -->
                  <td style="border: 1px solid #D1D5DB; padding: 10px; background: #EBF8FF; text-align: center; font-weight: 500; font-size: 14px; width: ${cellSizes.goalsFor};">
                    ${teamStanding?.goals_for || 0}
                  </td>
                  <!-- 失点 -->
                  <td style="border: 1px solid #D1D5DB; padding: 10px; background: #EBF8FF; text-align: center; font-weight: 500; font-size: 14px; width: ${cellSizes.goalsAgainst};">
                    ${teamStanding?.goals_against || 0}
                  </td>
                  <!-- 得失差 -->
                  <td style="border: 1px solid #D1D5DB; padding: 10px; background: #EBF8FF; text-align: center; font-weight: bold; color: ${goalDiffColor}; font-size: 14px; width: ${cellSizes.goalDiff};">
                    ${teamStanding ? ((teamStanding.goal_difference || 0) > 0 ? '+' : '') + (teamStanding.goal_difference || 0) : '0'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  // ヘルパー関数
  const getBlockColorValue = (blockName: string): string => {
    if (blockName?.includes('A')) return '#3B82F6';
    if (blockName?.includes('B')) return '#10B981';
    if (blockName?.includes('C')) return '#F59E0B';
    if (blockName?.includes('D')) return '#8B5CF6';
    return '#6B7280';
  };

  const getResultBackgroundColor = (result: string | null, score: string): string => {
    if (!result) return '#F3F4F6';
    if (result === 'win') return '#D1FAE5';
    if (result === 'loss') return '#FEE2E2';
    if (result === 'draw') return '#DBEAFE';
    return '#F3F4F6';
  };

  // ブロック色の取得（順位表と同じスタイル）
  const getBlockColor = (blockName: string): string => {
    if (blockName.includes('A')) return 'bg-blue-100 text-blue-800';
    if (blockName.includes('B')) return 'bg-green-100 text-green-800';
    if (blockName.includes('C')) return 'bg-yellow-100 text-yellow-800';
    if (blockName.includes('D')) return 'bg-purple-100 text-purple-800';
    if (blockName.includes('決勝')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  // 予選リーグかどうかの判定
  const isPreliminaryPhase = (phase: string): boolean => {
    return phase === 'preliminary' || phase.includes('予選') || phase.includes('リーグ');
  };

  // 特定ブロックの順位表データを取得
  const getStandingsForBlock = (blockId: number): TeamStanding[] => {
    const blockStanding = standings.find(s => s.match_block_id === blockId);
    return blockStanding ? blockStanding.teams : [];
  };

  // チーム順位情報を取得
  const getTeamStanding = (teamId: string, blockId: number): TeamStanding | undefined => {
    const blockTeams = getStandingsForBlock(blockId);
    return blockTeams.find((team: TeamStanding) => team.team_id === teamId);
  };

  // 順位アイコンの取得（順位表コンポーネントと同じ）
  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Trophy className="h-4 w-4 text-yellow-500" />;
      case 2:
        return <Medal className="h-4 w-4 text-gray-400" />;
      case 3:
        return <Award className="h-4 w-4 text-amber-600" />;
      default:
        return <Hash className="h-4 w-4 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Award className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">戦績表を読み込み中...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="text-center py-12">
          <Target className="h-8 w-8 mx-auto text-red-600 mb-4" />
          <p className="text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Award className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">戦績表</h3>
          <p className="text-gray-600">まだ試合結果がないため、戦績表を表示できません。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 概要統計 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Award className="h-5 w-5 mr-2 text-blue-600" />
              戦績表概要
            </div>
            <Button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {downloadingPdf ? 'PDF生成中...' : 'PDFダウンロード'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{results.length}</div>
              <div className="text-sm text-gray-600">ブロック数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {results.reduce((sum, block) => sum + block.teams.length, 0)}
              </div>
              <div className="text-sm text-gray-600">参加チーム数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {results.reduce((sum, block) => 
                  sum + block.matches.filter(match => 
                    match.is_confirmed && 
                    match.team1_goals !== null && 
                    match.team2_goals !== null
                  ).length, 0
                )}
              </div>
              <div className="text-sm text-gray-600">実施済み試合数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ブロック別戦績表 */}
      {results
        .filter(block => isPreliminaryPhase(block.phase)) // 予選リーグのみ表示
        .map((block) => (
        <Card key={block.match_block_id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(block.block_name)}`}>
                  {block.display_round_name || `${block.phase} ${block.block_name}ブロック`}
                </span>
                <span className="text-sm text-gray-600 flex items-center">
                  <Users className="h-4 w-4 mr-1" />
                  {block.teams.length}チーム
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {block.teams.length > 0 ? (
              <div className="overflow-x-auto">
                {/* 統合された戦績表（順位表情報 + 対戦結果） */}
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr>
                      <th className="border border-gray-300 p-3 bg-gray-100 text-sm font-medium text-gray-700 min-w-[90px]">
                        チーム
                      </th>
                      {/* 対戦結果の列ヘッダー（チーム略称を縦書き表示） */}
                      {block.teams.map((opponent) => (
                        <th 
                          key={opponent.team_id}
                          className="border border-gray-300 p-2 bg-green-50 text-sm font-medium text-gray-700 min-w-[70px] max-w-[90px]"
                        >
                          <div 
                            className="flex flex-col items-center justify-center h-20 overflow-hidden"
                            style={{ 
                              fontSize: '13px',
                              fontWeight: '500',
                              lineHeight: '1.1'
                            }}
                            title={opponent.team_name}
                          >
                            {(opponent.team_omission || opponent.team_name).split('').map((char, index) => (
                              <span key={index} className="block leading-tight">{char}</span>
                            ))}
                          </div>
                        </th>
                      ))}
                      {/* 予選リーグの場合は順位表の列を追加 */}
                      {isPreliminaryPhase(block.phase) && (
                        <>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[55px]">
                            順位
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[55px]">
                            勝点
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[50px]">
                            試合数
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[45px]">
                            勝
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[45px]">
                            分
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[45px]">
                            敗
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[50px]">
                            得点
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[50px]">
                            失点
                          </th>
                          <th className="border border-gray-300 p-2 bg-blue-50 text-sm font-medium text-gray-700 min-w-[55px]">
                            得失差
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {block.teams.map((team) => {
                      const teamStanding = getTeamStanding(team.team_id, block.match_block_id);
                      
                      return (
                        <tr key={team.team_id}>
                          {/* チーム名（略称優先） */}
                          <td className="border border-gray-300 p-3 bg-gray-50 font-medium text-sm">
                            <div 
                              className="truncate max-w-[80px]" 
                              title={team.team_name}
                            >
                              {team.team_omission || team.team_name}
                            </div>
                          </td>
                          
                          {/* 対戦結果 */}
                          {block.teams.map((opponent) => (
                            <td 
                              key={opponent.team_id}
                              className="border border-gray-300 p-2 text-center bg-green-50"
                            >
                              {team.team_id === opponent.team_id ? (
                                <div className="w-full h-10 bg-gray-200 flex items-center justify-center">
                                  <span className="text-gray-500 text-sm">-</span>
                                </div>
                              ) : (
                                <div 
                                  className={`w-full h-10 flex items-center justify-center text-base font-medium rounded ${
                                    getResultColor(block.match_matrix[team.team_id]?.[opponent.team_id]?.result || null, block.match_matrix[team.team_id]?.[opponent.team_id]?.score)
                                  }`}
                                  title={`vs ${opponent.team_name} (${block.match_matrix[team.team_id]?.[opponent.team_id]?.match_code || ''})`}
                                >
                                  <div className="text-center leading-tight whitespace-pre-line">
                                    {block.match_matrix[team.team_id]?.[opponent.team_id]?.score || '-'}
                                  </div>
                                </div>
                              )}
                            </td>
                          ))}
                          
                          {/* 予選リーグの場合は順位表の情報を表示 */}
                          {isPreliminaryPhase(block.phase) && (
                            <>
                              {/* 順位 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <div className="flex items-center justify-center">
                                  {teamStanding ? (
                                    <>
                                      {getPositionIcon(teamStanding.position)}
                                      <span className="ml-1 font-bold text-base">
                                        {teamStanding.position > 0 ? teamStanding.position : '-'}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-gray-400 text-sm">-</span>
                                  )}
                                </div>
                              </td>
                              
                              {/* 勝点 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="font-bold text-base text-blue-600">
                                  {teamStanding?.points || 0}
                                </span>
                              </td>
                              
                              {/* 試合数 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-sm">{teamStanding?.matches_played || 0}</span>
                              </td>
                              
                              {/* 勝利 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-green-600 font-medium text-sm">
                                  {teamStanding?.wins || 0}
                                </span>
                              </td>
                              
                              {/* 引分 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-yellow-600 font-medium text-sm">
                                  {teamStanding?.draws || 0}
                                </span>
                              </td>
                              
                              {/* 敗北 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="text-red-600 font-medium text-sm">
                                  {teamStanding?.losses || 0}
                                </span>
                              </td>
                              
                              {/* 総得点 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="font-medium text-sm">
                                  {teamStanding?.goals_for || 0}
                                </span>
                              </td>
                              
                              {/* 総失点 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span className="font-medium text-sm">
                                  {teamStanding?.goals_against || 0}
                                </span>
                              </td>
                              
                              {/* 得失差 */}
                              <td className="border border-gray-300 p-2 bg-blue-50 text-center">
                                <span 
                                  className={`font-bold text-sm ${
                                    (teamStanding?.goal_difference || 0) > 0 
                                      ? 'text-green-600' 
                                      : (teamStanding?.goal_difference || 0) < 0 
                                      ? 'text-red-600' 
                                      : 'text-gray-600'
                                  }`}
                                >
                                  {teamStanding ? (
                                    `${(teamStanding.goal_difference || 0) > 0 ? '+' : ''}${teamStanding.goal_difference || 0}`
                                  ) : '0'}
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* 凡例 */}
                <div className="mt-4 space-y-3">
                  {/* 列の説明 */}
                  <div className="flex flex-wrap gap-6 text-xs text-gray-600">
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-blue-50 border border-blue-200 rounded mr-2"></div>
                      順位表情報
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-green-50 border border-green-200 rounded mr-2"></div>
                      対戦結果
                    </div>
                  </div>
                  
                  {/* 対戦結果の凡例 */}
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <div className="flex items-center">
                      <div className="w-5 h-5 bg-green-50 text-green-600 rounded mr-2 flex items-center justify-center text-xs">
                        〇
                      </div>
                      勝利
                    </div>
                    <div className="flex items-center">
                      <div className="w-5 h-5 bg-red-50 text-red-600 rounded mr-2 flex items-center justify-center text-xs">
                        ●
                      </div>
                      敗北
                    </div>
                    <div className="flex items-center">
                      <div className="w-5 h-5 bg-blue-50 text-blue-600 rounded mr-2 flex items-center justify-center text-xs">
                        △
                      </div>
                      引分
                    </div>
                    <div className="flex items-center">
                      <div className="w-5 h-5 bg-gray-100 text-gray-600 rounded mr-2 flex items-center justify-center text-xs font-medium">
                        A1
                      </div>
未実施試合（試合コード表示）
                    </div>
                  </div>

                  {/* 注意書き */}
                  <div className="text-xs text-gray-500">
                    ※ 対戦結果：縦のチーム名が横のチーム名に対する結果を表示
                  </div>
                </div>

                {/* ブロック備考 */}
                {block.remarks && (
                  <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-medium text-amber-800 mb-1">
                          {block.block_name}ブロック 備考
                        </h4>
                        <p className="text-sm text-amber-700 whitespace-pre-wrap">
                          {block.remarks}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                このブロックには参加チームがありません
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* トーナメント戦の場合の注意書き */}
      {results.some(block => !isPreliminaryPhase(block.phase)) && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center text-blue-800">
              <Calendar className="h-4 w-4 mr-2" />
              <span className="text-sm">
                決勝トーナメントの戦績表は、リーグ戦形式ではないため表示されません。
                日程・結果タブで試合結果をご確認ください。
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}