'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Eye, Download, Clock, AlertTriangle } from 'lucide-react';
import { graphqlQuery, graphqlMutation } from '@/lib/graphql-client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingPage } from '@/components/ui/LoadingSpinner';

/**
 * Admin Product Imports Review Page
 * Review and approve bulk product uploads
 */
export default function AdminProductImportsPage() {
  const [selectedImport, setSelectedImport] = useState<any>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const queryClient = useQueryClient();

  // Fetch all imports
  const { data: imports, isLoading } = useQuery({
    queryKey: ['admin', 'product-imports'],
    queryFn: async () => {
      return graphqlQuery(`
        query GetAllImports {
          allProductImports(status: null, limit: 100) {
            id
            supplierId
            status
            fileType
            totalRows
            validRows
            invalidRows
            errorReportKey
            createdBy
            reviewedBy
            createdAt
            updatedAt
          }
        }
      `).then(res => res.allProductImports);
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (importId: string) => {
      return graphqlMutation(`
        mutation ApproveImport($id: ID!) {
          approveProductImport(id: $id) {
            id
            status
            summary
          }
        }
      `, { id: importId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'product-imports'] });
      setShowReviewModal(false);
      setSelectedImport(null);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ importId, reason }: { importId: string; reason: string }) => {
      return graphqlMutation(`
        mutation RejectImport($id: ID!, $reason: String) {
          rejectProductImport(id: $id, reason: $reason) {
            id
            status
          }
        }
      `, { id: importId, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'product-imports'] });
      setShowReviewModal(false);
      setSelectedImport(null);
    },
  });

  const handleReview = (importRecord: any) => {
    setSelectedImport(importRecord);
    setShowReviewModal(true);
  };

  if (isLoading) {
    return <LoadingPage message="Loading product imports..." />;
  }

  const pendingImports = imports?.filter((i: any) => i.status === 'READY') || [];
  const completedImports = imports?.filter((i: any) => i.status === 'COMPLETED') || [];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Product Import Reviews</h1>
          <p className="text-gray-600 mt-2">Review and approve bulk product uploads</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Pending Review</div>
            <div className="text-3xl font-bold text-orange-600">{pendingImports.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Completed</div>
            <div className="text-3xl font-bold text-green-600">{completedImports.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Total Imports</div>
            <div className="text-3xl font-bold text-gray-900">{imports?.length || 0}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Total Products</div>
            <div className="text-3xl font-bold text-blue-600">
              {imports?.reduce((sum: number, i: any) => sum + (i.validRows || 0), 0) || 0}
            </div>
          </div>
        </div>

        {/* Pending Imports */}
        {pendingImports.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Pending Review ({pendingImports.length})
            </h2>
            <div className="space-y-4">
              {pendingImports.map((importRecord: any) => (
                <div key={importRecord.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <StatusBadge status={importRecord.status} variant="large" />
                        <span className="text-sm text-gray-500">
                          {new Date(importRecord.createdAt).toLocaleString()}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-4 mt-3">
                        <div>
                          <div className="text-xs text-gray-600">Supplier</div>
                          <div className="font-medium text-gray-900">{importRecord.supplierId}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600">Total Rows</div>
                          <div className="font-medium text-gray-900">{importRecord.totalRows}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600">Valid</div>
                          <div className="font-medium text-green-600">{importRecord.validRows}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600">Invalid</div>
                          <div className="font-medium text-red-600">{importRecord.invalidRows}</div>
                        </div>
                      </div>

                      {importRecord.invalidRows > 0 && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-orange-600">
                          <AlertTriangle className="h-4 w-4" />
                          <span>{importRecord.invalidRows} rows will be skipped</span>
                          {importRecord.errorReportKey && (
                            <button className="text-blue-600 hover:text-blue-700 font-medium ml-2">
                              <Download className="inline h-4 w-4 mr-1" />
                              Error Report
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(importRecord)}
                        className="text-blue-600 hover:text-blue-700 px-4 py-2 rounded-lg border border-blue-200 hover:bg-blue-50 font-medium text-sm flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        Review
                      </button>
                      <button
                        onClick={() => approveMutation.mutate(importRecord.id)}
                        disabled={approveMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => rejectMutation.mutate({ importId: importRecord.id, reason: 'Quality concerns' })}
                        disabled={rejectMutation.isPending}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Imports */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Recent Imports
          </h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rows</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valid/Invalid</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {imports?.slice(0, 20).map((importRecord: any) => (
                  <tr key={importRecord.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{importRecord.supplierId}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={importRecord.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{importRecord.totalRows}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="text-green-600 font-medium">{importRecord.validRows}</span>
                      {' / '}
                      <span className="text-red-600 font-medium">{importRecord.invalidRows}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(importRecord.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <button
                        onClick={() => handleReview(importRecord)}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Review Modal */}
        {showReviewModal && selectedImport && (
          <ReviewModal
            importRecord={selectedImport}
            onClose={() => {
              setShowReviewModal(false);
              setSelectedImport(null);
            }}
            onApprove={() => approveMutation.mutate(selectedImport.id)}
            onReject={(reason) => rejectMutation.mutate({ importId: selectedImport.id, reason })}
          />
        )}
      </div>
    </div>
  );
}

function ReviewModal({ importRecord, onClose, onApprove, onReject }: any) {
  const [rejectReason, setRejectReason] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b px-6 py-4 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-xl font-semibold">Import Review</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XCircle className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">Total Rows</div>
              <div className="text-2xl font-bold text-gray-900">{importRecord.totalRows}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">Valid</div>
              <div className="text-2xl font-bold text-green-600">{importRecord.validRows}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">Invalid</div>
              <div className="text-2xl font-bold text-red-600">{importRecord.invalidRows}</div>
            </div>
          </div>

          {importRecord.invalidRows > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-900">Quality Warning</h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    {importRecord.invalidRows} rows have validation errors and will be skipped if approved.
                  </p>
                  {importRecord.errorReportKey && (
                    <button className="text-sm text-yellow-800 font-medium mt-2 hover:underline flex items-center gap-1">
                      <Download className="h-4 w-4" />
                      Download Error Report
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Import Details</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-600">Supplier ID</dt>
                <dd className="font-medium text-gray-900 mt-1">{importRecord.supplierId}</dd>
              </div>
              <div>
                <dt className="text-gray-600">File Type</dt>
                <dd className="font-medium text-gray-900 mt-1">{importRecord.fileType.toUpperCase()}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Created By</dt>
                <dd className="font-medium text-gray-900 mt-1">{importRecord.createdBy}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Created At</dt>
                <dd className="font-medium text-gray-900 mt-1">
                  {new Date(importRecord.createdAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>

          {/* Rejection Reason */}
          {importRecord.status === 'READY' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason (if rejecting)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-6 border-t">
            <button
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium"
            >
              Close
            </button>
            {importRecord.status === 'READY' && (
              <>
                <button
                  onClick={() => onReject(rejectReason || 'Rejected by admin')}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2"
                >
                  <XCircle className="h-5 w-5" />
                  Reject Import
                </button>
                <button
                  onClick={onApprove}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2"
                >
                  <CheckCircle className="h-5 w-5" />
                  Approve & Import
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

