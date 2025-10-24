'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ButtonActionProps {
  children: React.ReactNode;
  onClick?: () => Promise<void> | void;
  onConfirm?: () => Promise<void> | void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  disabled?: boolean;
  loading?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  successMessage?: string;
  errorMessage?: string;
  retryable?: boolean;
  maxRetries?: number;
  className?: string;
  'data-testid'?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  type?: 'button' | 'submit' | 'reset';
  form?: string;
}

export function ButtonAction({
  children,
  onClick,
  onConfirm,
  variant = 'default',
  size = 'default',
  disabled = false,
  loading = false,
  confirmTitle,
  confirmDescription,
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  successMessage,
  errorMessage,
  retryable = true,
  maxRetries = 3,
  className = '',
  'data-testid': testId,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  type = 'button',
  form,
  ...props
}: ButtonActionProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const { toast } = useToast();

  const handleClick = useCallback(async () => {
    if (disabled || isLoading || loading) return;

    // Show confirmation dialog if needed
    if (confirmTitle && onConfirm) {
      setShowConfirm(true);
      return;
    }

    await executeAction(onClick);
  }, [disabled, isLoading, loading, confirmTitle, onConfirm, onClick]);

  const handleConfirm = useCallback(async () => {
    setShowConfirm(false);
    await executeAction(onConfirm);
  }, [onConfirm]);

  const executeAction = useCallback(async (action?: () => Promise<void> | void) => {
    if (!action) return;

    setIsLoading(true);
    
    try {
      await action();
      
      // Show success message
      if (successMessage) {
        toast({
          title: 'Success',
          description: successMessage,
          variant: 'default',
        });
      }
      
      // Reset retry count on success
      setRetryCount(0);
      
    } catch (error) {
      console.error('ButtonAction error:', error);
      
      const errorMsg = errorMessage || (error instanceof Error ? error.message : 'An error occurred');
      
      // Show error message
      toast({
        title: 'Error',
        description: errorMsg,
        variant: 'destructive',
      });
      
      // Handle retries
      if (retryable && retryCount < maxRetries) {
        setRetryCount(prev => prev + 1);
        
        // Auto-retry after a delay
        setTimeout(() => {
          executeAction(action);
        }, 1000 * retryCount); // Exponential backoff
        
        toast({
          title: 'Retrying',
          description: `Attempt ${retryCount + 1} of ${maxRetries}`,
          variant: 'default',
        });
      }
      
    } finally {
      setIsLoading(false);
    }
  }, [successMessage, errorMessage, retryable, maxRetries, retryCount, toast]);

  const isDisabled = disabled || isLoading || loading;
  const showRetryIndicator = retryable && retryCount > 0 && retryCount < maxRetries;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        disabled={isDisabled}
        onClick={handleClick}
        className={`relative ${className}`}
        data-testid={testId}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        type={type}
        form={form}
        {...props}
      >
        {isLoading || loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading...
          </>
        ) : showRetryIndicator ? (
          <>
            <AlertTriangle className="w-4 h-4 mr-2" />
            Retrying... ({retryCount}/{maxRetries})
          </>
        ) : (
          children
        )}
      </Button>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-600 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">
                {confirmTitle}
              </h3>
            </div>
            
            {confirmDescription && (
              <p className="text-gray-600 mb-6">
                {confirmDescription}
              </p>
            )}
            
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                disabled={isLoading}
              >
                {cancelButtonText}
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  confirmButtonText
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Specialized button components for common actions
export function CreateButton({ 
  children = 'Create', 
  onCreate, 
  successMessage = 'Created successfully',
  ...props 
}: Omit<ButtonActionProps, 'onClick'> & { onCreate?: () => Promise<void> | void }) {
  return (
    <ButtonAction
      onClick={onCreate}
      successMessage={successMessage}
      data-testid="btn-create"
      {...props}
    >
      {children}
    </ButtonAction>
  );
}

export function EditButton({ 
  children = 'Edit', 
  onEdit, 
  successMessage = 'Updated successfully',
  ...props 
}: Omit<ButtonActionProps, 'onClick'> & { onEdit?: () => Promise<void> | void }) {
  return (
    <ButtonAction
      onClick={onEdit}
      successMessage={successMessage}
      data-testid="btn-edit"
      {...props}
    >
      {children}
    </ButtonAction>
  );
}

export function DeleteButton({ 
  children = 'Delete', 
  onDelete, 
  confirmTitle = 'Confirm Deletion',
  confirmDescription = 'Are you sure you want to delete this item? This action cannot be undone.',
  confirmButtonText = 'Delete',
  successMessage = 'Deleted successfully',
  errorMessage = 'Failed to delete item',
  ...props 
}: Omit<ButtonActionProps, 'onClick' | 'onConfirm'> & { onDelete?: () => Promise<void> | void }) {
  return (
    <ButtonAction
      onConfirm={onDelete}
      confirmTitle={confirmTitle}
      confirmDescription={confirmDescription}
      confirmButtonText={confirmButtonText}
      successMessage={successMessage}
      errorMessage={errorMessage}
      variant="destructive"
      data-testid="btn-delete"
      {...props}
    >
      {children}
    </ButtonAction>
  );
}

export function SaveButton({ 
  children = 'Save', 
  onSave, 
  successMessage = 'Saved successfully',
  ...props 
}: Omit<ButtonActionProps, 'onClick'> & { onSave?: () => Promise<void> | void }) {
  return (
    <ButtonAction
      onClick={onSave}
      successMessage={successMessage}
      data-testid="btn-save"
      type="submit"
      {...props}
    >
      {children}
    </ButtonAction>
  );
}

export function CancelButton({ 
  children = 'Cancel', 
  onCancel, 
  ...props 
}: Omit<ButtonActionProps, 'onClick'> & { onCancel?: () => void }) {
  return (
    <ButtonAction
      onClick={onCancel}
      variant="outline"
      data-testid="btn-cancel"
      {...props}
    >
      {children}
    </ButtonAction>
  );
}

export function ApproveButton({ 
  children = 'Approve', 
  onApprove, 
  confirmTitle = 'Approve Item',
  confirmDescription = 'Are you sure you want to approve this item?',
  successMessage = 'Approved successfully',
  ...props 
}: Omit<ButtonActionProps, 'onClick' | 'onConfirm'> & { onApprove?: () => Promise<void> | void }) {
  return (
    <ButtonAction
      onConfirm={onApprove}
      confirmTitle={confirmTitle}
      confirmDescription={confirmDescription}
      confirmButtonText="Approve"
      successMessage={successMessage}
      variant="default"
      data-testid="btn-approve"
      {...props}
    >
      {children}
    </ButtonAction>
  );
}

export function RejectButton({ 
  children = 'Reject', 
  onReject, 
  confirmTitle = 'Reject Item',
  confirmDescription = 'Are you sure you want to reject this item?',
  confirmButtonText = 'Reject',
  successMessage = 'Rejected successfully',
  ...props 
}: Omit<ButtonActionProps, 'onClick' | 'onConfirm'> & { onReject?: () => Promise<void> | void }) {
  return (
    <ButtonAction
      onConfirm={onReject}
      confirmTitle={confirmTitle}
      confirmDescription={confirmDescription}
      confirmButtonText={confirmButtonText}
      successMessage={successMessage}
      variant="destructive"
      data-testid="btn-reject"
      {...props}
    >
      {children}
    </ButtonAction>
  );
}

// Hook for managing button states
export function useButtonAction() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const execute = useCallback(async (action: () => Promise<void> | void, options?: {
    successMessage?: string;
    errorMessage?: string;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
  }) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await action();
      
      if (options?.successMessage) {
        toast({
          title: 'Success',
          description: options.successMessage,
          variant: 'default',
        });
      }
      
      options?.onSuccess?.();
      
    } catch (err) {
      const errorMsg = options?.errorMessage || (err instanceof Error ? err.message : 'An error occurred');
      setError(errorMsg);
      
      toast({
        title: 'Error',
        description: errorMsg,
        variant: 'destructive',
      });
      
      options?.onError?.(err as Error);
      
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  return {
    isLoading,
    error,
    execute,
  };
}