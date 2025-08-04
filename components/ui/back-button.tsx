'use client';

import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface BackButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export default function BackButton({ className, children }: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    router.back();
  };

  return (
    <Button 
      variant="ghost" 
      onClick={handleBack}
      className={`flex items-center text-gray-600 hover:text-gray-900 ${className || ''}`}
    >
      <ArrowLeft className="h-4 w-4 mr-2" />
      {children || '前の画面に戻る'}
    </Button>
  );
}