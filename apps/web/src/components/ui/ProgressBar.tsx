/**
 * Progress Bar Component
 * Visual progress indicator
 */

interface ProgressBarProps {
  value: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function ProgressBar({
  value,
  label,
  showPercentage = true,
  variant = 'default',
  size = 'md',
}: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  const variantColors = {
    default: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-500',
    danger: 'bg-red-600',
  };

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  // Auto-detect variant based on value
  const autoVariant = variant === 'default' && clampedValue >= 90
    ? 'danger'
    : variant === 'default' && clampedValue >= 70
    ? 'warning'
    : variant;

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-1 text-sm">
          {label && <span className="text-gray-700">{label}</span>}
          {showPercentage && (
            <span className="font-medium text-gray-900">{clampedValue.toFixed(0)}%</span>
          )}
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`${sizeClasses[size]} rounded-full transition-all duration-300 ${variantColors[autoVariant]}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}

