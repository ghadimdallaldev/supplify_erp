/**
 * Status Badge Component
 * Consistent status indicators across the app
 */

interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'large';
}

export function StatusBadge({ status, variant = 'default' }: StatusBadgeProps) {
  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    
    if (statusLower.includes('active') || statusLower.includes('completed') || statusLower.includes('approved')) {
      return 'bg-green-100 text-green-800';
    }
    if (statusLower.includes('pending') || statusLower.includes('validating')) {
      return 'bg-yellow-100 text-yellow-800';
    }
    if (statusLower.includes('paused') || statusLower.includes('hold')) {
      return 'bg-orange-100 text-orange-800';
    }
    if (statusLower.includes('rejected') || statusLower.includes('failed') || statusLower.includes('cancelled')) {
      return 'bg-red-100 text-red-800';
    }
    if (statusLower.includes('progress')) {
      return 'bg-blue-100 text-blue-800';
    }
    
    return 'bg-gray-100 text-gray-800';
  };

  const sizeClasses = variant === 'large' 
    ? 'px-3 py-1.5 text-sm font-semibold'
    : 'px-2.5 py-0.5 text-xs font-medium';

  return (
    <span className={`inline-flex items-center rounded-full ${sizeClasses} ${getStatusColor(status)}`}>
      {status}
    </span>
  );
}

