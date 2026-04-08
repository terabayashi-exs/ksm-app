"use client";

// components/features/my/TeamMergeConfirmDialog.tsx
// チーム統合確認ダイアログ

import { AlertTriangle, ArrowRight, CheckCircle, Shield, Trash2 } from "lucide-react";
import React, { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TeamInfo {
  team_id: string;
  team_name: string;
  team_omission: string | null;
  player_count: number;
}

interface TeamMergeConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mainTeam: TeamInfo;
  absorbedTeams: TeamInfo[];
}

export default function TeamMergeConfirmDialog({
  isOpen,
  onClose,
  onSuccess,
  mainTeam,
  absorbedTeams,
}: TeamMergeConfirmDialogProps) {
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleMerge = async () => {
    try {
      setMerging(true);
      setError(null);

      // 吸収対象チームを1つずつ統合
      for (const absorbed of absorbedTeams) {
        const res = await fetch("/api/my/teams/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mainTeamId: mainTeam.team_id,
            absorbedTeamId: absorbed.team_id,
          }),
        });

        const data = await res.json();
        if (!data.success) {
          setError(data.error || "統合に失敗しました");
          return;
        }
      }

      setSuccess("チーム統合が完了しました");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch {
      setError("チーム統合中にエラーが発生しました");
    } finally {
      setMerging(false);
    }
  };

  const handleClose = () => {
    if (!merging) {
      setError(null);
      setSuccess(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            チーム統合
          </DialogTitle>
          <DialogDescription>
            以下の内容でチームを統合します。この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* メインチーム */}
          <div className="p-4 rounded-lg border-2 border-green-300 bg-green-50">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-green-600" />
              <span className="text-sm font-semibold text-green-800">メインチーム（残る）</span>
            </div>
            <p className="text-lg font-bold text-green-900">
              {mainTeam.team_name}
              {mainTeam.team_omission && (
                <span className="text-sm font-normal text-green-700 ml-2">
                  （{mainTeam.team_omission}）
                </span>
              )}
            </p>
            <p className="text-xs text-green-700 mt-1">ID: {mainTeam.team_id}</p>
          </div>

          <div className="flex justify-center">
            <ArrowRight className="w-5 h-5 text-gray-400 rotate-90" />
          </div>

          {/* 吸収されるチーム */}
          {absorbedTeams.map((team) => (
            <div key={team.team_id} className="p-4 rounded-lg border-2 border-red-200 bg-red-50">
              <div className="flex items-center gap-2 mb-1">
                <Trash2 className="w-4 h-4 text-red-500" />
                <span className="text-sm font-semibold text-red-700">統合されるチーム（削除）</span>
              </div>
              <p className="text-lg font-bold text-red-900">
                {team.team_name}
                {team.team_omission && (
                  <span className="text-sm font-normal text-red-700 ml-2">
                    （{team.team_omission}）
                  </span>
                )}
              </p>
              <p className="text-xs text-red-700 mt-1">ID: {team.team_id}</p>
            </div>
          ))}

          {/* 注意事項 */}
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 text-sm">
              <ul className="list-disc list-inside space-y-1.5 ml-2">
                <li>
                  統合されるチームのマスターデータ（チーム情報・選手情報）は<strong>削除</strong>
                  されます
                </li>
                <li>
                  大会参加記録のチーム名は<strong>そのまま残ります</strong>
                  （参加履歴は失われません）
                </li>
                <li>統合後、大会参加記録はメインチームに紐づきます</li>
                <li>
                  この操作は<strong>取り消せません</strong>
                </li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* エラー・成功メッセージ */}
          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">{success}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={merging || !!success}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleMerge}
            disabled={merging || !!success}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {merging ? "統合中..." : success ? "統合完了" : "統合する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
