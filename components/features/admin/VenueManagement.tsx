'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Edit, Trash2, Plus, Building, MapPin, Users } from 'lucide-react';

interface Venue {
  venue_id: number;
  venue_name: string;
  address: string;
  available_courts: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface VenueFormData {
  venue_name: string;
  address: string;
  available_courts: number;
  is_active: boolean;
}

export default function VenueManagement() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<VenueFormData>({
    venue_name: '',
    address: '',
    available_courts: 1,
    is_active: true
  });
  const [saving, setSaving] = useState(false);

  // 会場一覧を取得
  const fetchVenues = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/venues');
      if (!response.ok) {
        throw new Error('会場データの取得に失敗しました');
      }
      const result = await response.json();
      if (result.success) {
        setVenues(result.data);
      } else {
        throw new Error(result.error || '会場データの取得に失敗しました');
      }
    } catch (err) {
      console.error('Error fetching venues:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVenues();
  }, []);

  // フォームリセット
  const resetForm = () => {
    setFormData({
      venue_name: '',
      address: '',
      available_courts: 1,
      is_active: true
    });
    setEditingVenue(null);
    setIsCreating(false);
    setError(null);
  };

  // 新規作成開始
  const startCreating = () => {
    resetForm();
    setIsCreating(true);
  };

  // 編集開始
  const startEditing = (venue: Venue) => {
    setFormData({
      venue_name: venue.venue_name,
      address: venue.address,
      available_courts: venue.available_courts,
      is_active: venue.is_active
    });
    setEditingVenue(venue);
    setIsCreating(false);
    setError(null);
  };

  // 保存処理
  const handleSave = async () => {
    if (!formData.venue_name.trim()) {
      setError('会場名を入力してください');
      return;
    }
    if (!formData.address.trim()) {
      setError('住所を入力してください');
      return;
    }
    if (formData.available_courts < 1) {
      setError('利用可能コート数は1以上で入力してください');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const url = editingVenue 
        ? `/api/venues/${editingVenue.venue_id}`
        : '/api/venues';
      
      const method = editingVenue ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('保存に失敗しました');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '保存に失敗しました');
      }

      // 一覧を再取得
      await fetchVenues();
      resetForm();
      
    } catch (err) {
      console.error('Error saving venue:', err);
      setError(err instanceof Error ? err.message : '保存中にエラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  // 削除処理
  const handleDelete = async (venue: Venue) => {
    if (!confirm(`会場「${venue.venue_name}」を削除しますか？\n\n※この操作は取り消せません。\n※使用中の大会がある場合は削除できません。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/venues/${venue.venue_id}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        // 使用中の大会がある場合の詳細エラー表示
        if (result.usedTournaments && result.usedTournaments.length > 0) {
          const tournamentList = result.usedTournaments
            .map((t: { tournament_name: string; status: string }) => `・${t.tournament_name}（${t.status === 'planning' ? '準備中' : t.status === 'ongoing' ? '開催中' : '完了'}）`)
            .join('\n');
          
          setError(`${result.error}\n\n使用中の大会一覧:\n${tournamentList}`);
        } else {
          setError(result.error || '削除に失敗しました');
        }
        return;
      }

      // 一覧を再取得
      await fetchVenues();
      setError(null);
      
    } catch (err) {
      console.error('Error deleting venue:', err);
      setError(err instanceof Error ? err.message : '削除中にエラーが発生しました');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">会場データを読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* エラー表示 */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-start space-x-2 text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="text-sm whitespace-pre-line">{error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 新規登録ボタン */}
      {!isCreating && !editingVenue && (
        <div className="flex justify-end">
          <Button onClick={startCreating} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            新規会場登録
          </Button>
        </div>
      )}

      {/* 登録・編集フォーム */}
      {(isCreating || editingVenue) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              {editingVenue ? '会場編集' : '新規会場登録'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="venue_name">会場名 *</Label>
                <Input
                  id="venue_name"
                  value={formData.venue_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, venue_name: e.target.value }))}
                  placeholder="例: 中央スポーツパーク"
                />
              </div>
              <div>
                <Label htmlFor="available_courts">利用可能コート数 *</Label>
                <Input
                  id="available_courts"
                  type="number"
                  min="1"
                  value={formData.available_courts}
                  onChange={(e) => setFormData(prev => ({ ...prev, available_courts: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="address">住所 *</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                placeholder="例: 東京都中央区スポーツ1-1-1"
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
              />
              <Label htmlFor="is_active">利用可能</Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                キャンセル
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 会場一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            登録済み会場一覧
          </CardTitle>
        </CardHeader>
        <CardContent>
          {venues.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              登録された会場がありません
            </div>
          ) : (
            <div className="space-y-4">
              {venues.map((venue) => (
                <div
                  key={venue.venue_id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900">{venue.venue_name}</h3>
                      {!venue.is_active && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                          利用停止中
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-1">{venue.address}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {venue.available_courts}コート
                      </span>
                      <span>登録日: {new Date(venue.created_at).toLocaleDateString('ja-JP')}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(venue)}
                      className="flex items-center gap-1"
                    >
                      <Edit className="h-4 w-4" />
                      編集
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(venue)}
                      className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:border-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                      削除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}