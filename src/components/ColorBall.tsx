import { cn } from '@/lib/utils';
import { BlazeColor } from '@/types/blaze';

interface ColorBallProps {
  color: BlazeColor;
  number?: number;
  size?: 'sm' | 'md' | 'lg';
  showNumber?: boolean;
  className?: string;
  animate?: boolean;
}

export function ColorBall({
  color,
  number,
  size = 'md',
  showNumber = false,
  className,
  animate = false,
}: ColorBallProps) {
  const sizeClasses = {
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
  };

  const colorClasses = {
    red: 'blaze-red text-white',
    black: 'blaze-black text-white',
    white: 'blaze-white text-black',
  };

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold font-display transition-all duration-300',
        sizeClasses[size],
        colorClasses[color],
        animate && 'animate-fade-in',
        className
      )}
    >
      {showNumber && number !== undefined ? number : ''}
    </div>
  );
}
