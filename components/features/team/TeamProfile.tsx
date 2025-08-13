'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Users } from 'lucide-react';

interface Team {
  team_id: string;
  team_name: string;
  team_omission?: string;
  contact_person: string;
  contact_email: string;
  contact_phone?: string;
  is_active: boolean;
}

interface TeamProfileData {
  team: Team;
}

export default function TeamProfile() {
  const [profileData, setProfileData] = useState<TeamProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // チーム情報を取得
  const fetchTeamProfile = async () => {
    try {
      const response = await fetch('/api/teams/profile');
      const result = await response.json();
      
      if (result.success) {
        setProfileData({ team: result.data.team });
      } else {
        setError(result.error || 'チーム情報の取得に失敗しました');
      }
    } catch (error) {
      console.error('Team profile fetch error:', error);
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamProfile();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">チーム情報を読み込み中...</p>
        </CardContent>
      </Card>
    );
  }

  if (!profileData) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6">
          <p className="text-red-600 text-center">チーム情報が見つかりません</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* エラーメッセージ */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* チーム基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="w-5 h-5 mr-2" />
            チーム情報
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">チーム名</Label>
              <p className="text-lg font-semibold">{profileData.team.team_name}</p>
            </div>
            {profileData.team.team_omission && (
              <div>
                <Label className="text-sm font-medium text-gray-700">チーム略称</Label>
                <p className="text-lg">{profileData.team.team_omission}</p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium text-gray-700">代表者名</Label>
              <p className="text-lg">{profileData.team.contact_person}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">連絡先メール</Label>
              <p className="text-lg">{profileData.team.contact_email}</p>
            </div>
            {profileData.team.contact_phone && (
              <div>
                <Label className="text-sm font-medium text-gray-700">電話番号</Label>
                <p className="text-lg">{profileData.team.contact_phone}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}