// app/admin/announcements/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import AnnouncementManagement from "@/components/features/admin/AnnouncementManagement";

export default async function AnnouncementsPage() {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">お知らせ管理</h1>
              <p className="text-sm text-muted-foreground mt-1">
                TOPページに表示するお知らせの管理を行います
              </p>
            </div>
            <div>
              <Button asChild variant="outline">
                <Link href="/admin">ダッシュボードに戻る</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnnouncementManagement />
      </div>
    </div>
  );
}
