'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface TournamentGroupFormProps {
  group?: {
    group_id: number;
    group_name: string;
    group_description?: string;
    group_color: string;
    display_order: number;
  };
}

const colorOptions = [
  { label: '青', value: '#3B82F6' },
  { label: '緑', value: '#10B981' },
  { label: '赤', value: '#EF4444' },
  { label: '紫', value: '#8B5CF6' },
  { label: '黄', value: '#F59E0B' },
  { label: 'ピンク', value: '#EC4899' },
  { label: '灰', value: '#6B7280' },
  { label: '茶', value: '#92400E' },
];

export default function TournamentGroupForm({ group }: TournamentGroupFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    group_name: group?.group_name || '',
    group_description: group?.group_description || '',
    group_color: group?.group_color || '#3B82F6',
    display_order: group?.display_order || 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.group_name.trim()) {
      alert('グループ名を入力してください');
      return;
    }

    setLoading(true);

    try {
      const url = group 
        ? `/api/tournament-groups/${group.group_id}`
        : '/api/tournament-groups';
      
      const method = group ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        router.push('/admin/tournament-groups');
        router.refresh();
      } else {
        alert(`エラー: ${result.error}`);
      }
    } catch (error) {
      console.error('送信エラー:', error);
      alert('送信中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label htmlFor="group_name">グループ名 *</Label>
        <Input
          id="group_name"
          value={formData.group_name}
          onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
          placeholder="例: 第11回とやまPK選手権大会"
          maxLength={100}
          required
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="group_description">説明</Label>
        <Textarea
          id="group_description"
          value={formData.group_description}
          onChange={(e) => setFormData({ ...formData, group_description: e.target.value })}
          placeholder="例: in 富山県総合運動公園"
          rows={3}
          className="mt-1"
        />
      </div>

      <div>
        <Label>表示色</Label>
        <div className="grid grid-cols-4 gap-3 mt-2">
          {colorOptions.map((color) => (
            <label
              key={color.value}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="group_color"
                value={color.value}
                checked={formData.group_color === color.value}
                onChange={(e) => setFormData({ ...formData, group_color: e.target.value })}
                className="sr-only"
              />
              <div
                className={`w-6 h-6 rounded border-2 ${
                  formData.group_color === color.value
                    ? 'border-gray-900 ring-2 ring-offset-2 ring-gray-400'
                    : 'border-gray-300'
                }`}
                style={{ backgroundColor: color.value }}
              />
              <span className="text-sm">{color.label}</span>
            </label>
          ))}
        </div>
        <p className="text-sm text-gray-600 mt-2">
          管理画面でグループを識別しやすくするための色です
        </p>
      </div>

      <div className="flex gap-4 pt-4">
        <Button
          type="submit"
          disabled={loading}
          variant="outline"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {group ? '更新中...' : '作成中...'}
            </>
          ) : (
            group ? 'グループを更新' : 'グループを作成'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/admin/tournament-groups')}
          disabled={loading}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}