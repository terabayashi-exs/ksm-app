'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface CourtSetting {
  court_number: number;
  court_name: string;
}

interface CourtSettingsFormProps {
  tournamentId: number;
  maxCourts: number;
}

export default function CourtSettingsForm({ tournamentId, maxCourts }: CourtSettingsFormProps) {
  const [courtSettings, setCourtSettings] = useState<CourtSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchCourtSettings = async () => {
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/courts`);
        const result = await response.json();

        if (result.success) {
          // 既存設定を取得
          const existingSettings = result.data as Array<{
            court_number: number;
            court_name: string;
          }>;

          // 全コート番号分の配列を作成
          const allCourts: CourtSetting[] = [];
          for (let i = 1; i <= maxCourts; i++) {
            const existing = existingSettings.find(s => s.court_number === i);
            allCourts.push({
              court_number: i,
              court_name: existing?.court_name || ''
            });
          }

          setCourtSettings(allCourts);
        } else {
          setError(result.error || 'コート設定の取得に失敗しました');
        }
      } catch (err) {
        console.error('コート設定取得エラー:', err);
        setError('コート設定の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchCourtSettings();
  }, [tournamentId, maxCourts]);

  const handleCourtNameChange = (courtNumber: number, courtName: string) => {
    setCourtSettings(prev =>
      prev.map(court =>
        court.court_number === courtNumber
          ? { ...court, court_name: courtName }
          : court
      )
    );
    setSuccessMessage(null);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/courts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          courts: courtSettings
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccessMessage('コート名を保存しました');
      } else {
        setError(result.error || '保存に失敗しました');
      }
    } catch (err) {
      console.error('コート名保存エラー:', err);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const getPreviewText = (courtNumber: number, courtName: string): string => {
    if (!courtName || courtName.trim() === '') {
      return String(courtNumber);
    }
    return courtName.trim();
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
        <p className="text-muted-foreground mt-2">コート設定を読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start">
          <CheckCircle className="h-5 w-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
          <p className="text-green-600 text-sm">{successMessage}</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">設定のヒント</h3>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>コート名を空欄にすると、コート番号のみが表示されます（例: 「1」）</li>
            <li>コート名を入力すると、その名前が表示されます（例: 「Aコート」）</li>
            <li>最大50文字まで入力できます</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courtSettings.map((court) => (
            <div key={court.court_number} className="border rounded-lg p-4 space-y-3">
              <div>
                <Label htmlFor={`court-${court.court_number}`} className="text-base font-semibold">
                  コート {court.court_number}
                </Label>
              </div>

              <div>
                <Label htmlFor={`court-${court.court_number}`} className="text-sm text-muted-foreground">
                  表示名
                </Label>
                <Input
                  id={`court-${court.court_number}`}
                  type="text"
                  value={court.court_name}
                  onChange={(e) => handleCourtNameChange(court.court_number, e.target.value)}
                  placeholder={`例: Aコート、第${court.court_number}コート`}
                  maxLength={50}
                  className="mt-1"
                />
              </div>

              <div className="bg-gray-50 rounded p-2 border border-gray-200">
                <p className="text-xs text-muted-foreground mb-1">プレビュー:</p>
                <p className="text-sm font-medium">
                  {getPreviewText(court.court_number, court.court_name)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              保存する
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
