'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Pencil, Trash2, UserPlus, Power } from 'lucide-react';
import type { OperatorWithAccess } from '@/lib/types/operator';

interface OperatorListProps {
  groupId?: number;
}

export default function OperatorList({ groupId }: OperatorListProps) {
  const router = useRouter();
  const [operators, setOperators] = useState<OperatorWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const fetchOperators = useCallback(async () => {
    try {
      const url = groupId
        ? `/api/admin/operators?group_id=${groupId}`
        : '/api/admin/operators';
      const response = await fetch(url);
      if (!response.ok) throw new Error('運営者一覧の取得に失敗しました');
      const data = await response.json();
      setOperators(data);
    } catch (error) {
      console.error('運営者一覧の取得に失敗しました:', error);
      alert('運営者一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  const handleToggleActive = async (operatorId: number) => {
    try {
      const response = await fetch(`/api/admin/operators/${operatorId}/toggle-active`, {
        method: 'PUT',
      });

      if (!response.ok) throw new Error('有効/無効の切り替えに失敗しました');

      const data = await response.json();
      alert(data.message);
      fetchOperators();
    } catch (error) {
      console.error('有効/無効の切り替えに失敗しました:', error);
      alert('有効/無効の切り替えに失敗しました');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const response = await fetch(`/api/admin/operators/${deleteTarget}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('運営者の削除に失敗しました');

      alert('運営者を削除しました');
      setDeleteTarget(null);
      fetchOperators();
    } catch (error) {
      console.error('運営者の削除に失敗しました:', error);
      alert('運営者の削除に失敗しました');
    }
  };

  // 部門アクセス数を取得
  const getTournamentCount = (operator: OperatorWithAccess): number => {
    return operator.accessibleTournaments?.length || 0;
  };

  if (loading) {
    return <div className="text-center py-8">読み込み中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {operators.length}名の運営者が登録されています
        </div>
        <Button
          onClick={() =>
            router.push(
              groupId
                ? `/admin/operators/new?group_id=${groupId}`
                : '/admin/operators/new'
            )
          }
        >
          <UserPlus className="mr-2 h-4 w-4" />
          運営者を追加
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ログインID</TableHead>
              <TableHead>名前</TableHead>
              <TableHead>アクセス可能部門</TableHead>
              <TableHead>状態</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operators.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  運営者が登録されていません
                </TableCell>
              </TableRow>
            ) : (
              operators.map((operator) => (
                <TableRow key={operator.operatorId}>
                  <TableCell className="font-medium">
                    {operator.operatorLoginId}
                  </TableCell>
                  <TableCell>{operator.operatorName}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {getTournamentCount(operator) === 0 ? (
                        <span className="text-muted-foreground">なし</span>
                      ) : (
                        <span>{getTournamentCount(operator)}部門</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {operator.isActive ? (
                      <Badge variant="default">有効</Badge>
                    ) : (
                      <Badge variant="secondary">無効</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(operator.operatorId)}
                        title={operator.isActive ? '無効にする' : '有効にする'}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const url = groupId
                            ? `/admin/operators/${operator.operatorId}/edit?group_id=${groupId}`
                            : `/admin/operators/${operator.operatorId}/edit`;
                          router.push(url);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTarget(operator.operatorId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>運営者を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。運営者アカウントとすべての関連データが削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
