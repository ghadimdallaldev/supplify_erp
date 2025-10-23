'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Download, Upload, CheckCircle, AlertTriangle, X, FileSpreadsheet,
  ArrowRight, ArrowLeft, Loader2
} from 'lucide-react';

interface BulkUploadWizardProps {
  open: boolean;
  onClose: () => void;
  supplierId: string;
}

type Step = 'download' | 'upload' | 'preview' | 'result';

/**
 * Bulk Upload Wizard Component
 * Multi-step Excel/CSV product import with validation
 */
export function BulkUploadWizard({ open, onClose, supplierId }: BulkUploadWizardProps) {
  const [step, setStep] = useState<Step>('download');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Download template mutation
  const downloadTemplateMutation = useMutation({
    mutationFn: async (format: string) => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation DownloadTemplate($format: String!) {
              downloadProductTemplate(format: $format) {
                downloadUrl
                fileName
              }
            }
          `,
          variables: { format },
        }),
      });

      const result = await response.json();
      return result.data.downloadProductTemplate;
    },
    onSuccess: (data) => {
      // Trigger download
      window.open(data.downloadUrl, '_blank');
    },
  });

  // Upload file mutation
  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      // Step 1: Get presigned URL
      const presignedResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation GetUploadUrl($fileName: String!, $fileType: String!) {
              getProductUploadUrl(fileName: $fileName, fileType: $fileType) {
                uploadUrl
                fileKey
              }
            }
          `,
          variables: {
            fileName: file.name,
            fileType: file.type,
          },
        }),
      });

      const presignedResult = await presignedResponse.json();
      const { uploadUrl, fileKey } = presignedResult.data.getProductUploadUrl;

      // Step 2: Upload to S3
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      // Step 3: Create import
      const importResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation CreateImport($input: CreateProductImportInput!) {
              createProductImport(input: $input) {
                id
                status
              }
            }
          `,
          variables: {
            input: {
              fileKey,
              fileType: format,
            },
          },
        }),
      });

      const importResult = await importResponse.json();
      return importResult.data.createProductImport;
    },
    onSuccess: (data) => {
      setImportId(data.id);
      setStep('preview');
    },
  });

  // Poll import status
  const { data: importData, isLoading: isPolling } = useQuery({
    queryKey: ['productImport', importId],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetImport($id: ID!) {
              productImport(id: $id) {
                id
                status
                totalRows
                validRows
                invalidRows
                errorReportUrl
                summary
              }
            }
          `,
          variables: { id: importId },
        }),
      });

      const result = await response.json();
      return result.data.productImport;
    },
    enabled: !!importId && step === 'preview',
    refetchInterval: (data: any) => {
      // Stop polling when status is READY, COMPLETED, or FAILED
      if (data?.status && ['READY', 'COMPLETED', 'FAILED'].includes(data.status)) {
        return false;
      }
      return 2000; // Poll every 2 seconds
    },
  });

  // Confirm import mutation
  const confirmImportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation ApproveImport($id: ID!) {
              approveProductImport(id: $id) {
                id
                status
                summary
              }
            }
          `,
          variables: { id: importId },
        }),
      });

      const result = await response.json();
      return result.data.approveProductImport;
    },
    onSuccess: () => {
      setStep('result');
      queryClient.invalidateQueries({ queryKey: ['products', supplierId] });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const handleUpload = () => {
    if (uploadedFile) {
      uploadFileMutation.mutate(uploadedFile);
    }
  };

  const handleClose = () => {
    setStep('download');
    setUploadedFile(null);
    setImportId(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Bulk Upload Products</h2>
            <p className="text-sm text-gray-600 mt-1">Import products via Excel or CSV file</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            {['Download Template', 'Upload File', 'Review & Import', 'Results'].map((label, idx) => {
              const stepMap: Step[] = ['download', 'upload', 'preview', 'result'];
              const currentIdx = stepMap.indexOf(step);
              const isActive = idx === currentIdx;
              const isComplete = idx < currentIdx;

              return (
                <div key={label} className="flex items-center">
                  <div className={`flex items-center ${idx > 0 ? 'ml-4' : ''}`}>
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        isComplete
                          ? 'bg-green-600 text-white'
                          : isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {isComplete ? <CheckCircle className="h-5 w-5" /> : idx + 1}
                    </div>
                    <span className={`ml-2 text-sm ${isActive ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                      {label}
                    </span>
                  </div>
                  {idx < 3 && (
                    <div className={`h-0.5 w-16 mx-2 ${isComplete ? 'bg-green-600' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'download' && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <FileSpreadsheet className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Step 1: Download Template
                </h3>
                <p className="text-gray-600 mb-6">
                  Download our template file with instructions and example data
                </p>

                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => {
                      setFormat('xlsx');
                      downloadTemplateMutation.mutate('xlsx');
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <Download className="h-5 w-5" />
                    Download Excel (.xlsx)
                  </button>
                  
                  <button
                    onClick={() => {
                      setFormat('csv');
                      downloadTemplateMutation.mutate('csv');
                    }}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <Download className="h-5 w-5" />
                    Download CSV (.csv)
                  </button>
                </div>
              </div>

              <div className="border-t pt-6">
                <button
                  onClick={() => setStep('upload')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  Next: Upload File
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <Upload className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Step 2: Upload Your File
                </h3>
                <p className="text-gray-600 mb-6">
                  Upload the filled template file ({format.toUpperCase()})
                </p>

                <div className="max-w-md mx-auto">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
                    <input
                      type="file"
                      accept={format === 'xlsx' ? '.xlsx,.xls' : '.csv'}
                      onChange={handleFileSelect}
                      className="hidden"
                      id="bulk-upload"
                    />
                    <label
                      htmlFor="bulk-upload"
                      className="flex flex-col items-center cursor-pointer"
                    >
                      <FileSpreadsheet className="h-12 w-12 text-gray-400 mb-3" />
                      <span className="text-sm text-gray-600">
                        {uploadedFile ? uploadedFile.name : `Click to select ${format.toUpperCase()} file`}
                      </span>
                      <span className="text-xs text-gray-500 mt-2">
                        Max 10MB
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6 flex gap-3">
                <button
                  onClick={() => setStep('download')}
                  className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!uploadedFile || uploadFileMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {uploadFileMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      Upload & Validate
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              {importData?.status === 'VALIDATING' && (
                <div className="text-center py-8">
                  <Loader2 className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Validating Your File...
                  </h3>
                  <p className="text-gray-600">
                    This may take a few moments depending on file size
                  </p>
                </div>
              )}

              {importData?.status === 'READY' && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Validation Complete
                    </h3>
                    
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-white rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-gray-900">
                          {importData.totalRows}
                        </div>
                        <div className="text-sm text-gray-600">Total Rows</div>
                      </div>
                      
                      <div className="bg-white rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {importData.validRows}
                        </div>
                        <div className="text-sm text-gray-600">Valid</div>
                      </div>
                      
                      <div className="bg-white rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {importData.invalidRows}
                        </div>
                        <div className="text-sm text-gray-600">Invalid</div>
                      </div>
                    </div>

                    {importData.invalidRows > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-yellow-900">
                            {importData.invalidRows} rows have errors
                          </h4>
                          <p className="text-sm text-yellow-700 mt-1">
                            Invalid rows will be skipped. Download error report to fix them.
                          </p>
                          {importData.errorReportUrl && (
                            <a
                              href={importData.errorReportUrl}
                              download
                              className="inline-flex items-center gap-2 text-sm text-yellow-800 font-medium mt-2 hover:underline"
                            >
                              <Download className="h-4 w-4" />
                              Download Error Report
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-6 flex gap-3">
                    <button
                      onClick={() => setStep('upload')}
                      className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 px-6 py-3 rounded-lg font-medium transition-colors"
                    >
                      Upload Different File
                    </button>
                    <button
                      onClick={() => confirmImportMutation.mutate()}
                      disabled={importData.validRows === 0 || confirmImportMutation.isPending}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {confirmImportMutation.isPending ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-5 w-5" />
                          Confirm & Import {importData.validRows} Products
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'result' && importData?.summary && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                  Import Completed!
                </h3>
                <p className="text-gray-600 mb-6">
                  Your products have been successfully imported
                </p>

                <div className="max-w-md mx-auto bg-gray-50 rounded-lg p-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Created:</span>
                      <span className="font-semibold text-green-600">
                        {importData.summary.imported || 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Updated:</span>
                      <span className="font-semibold text-blue-600">
                        {importData.summary.updated || 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Skipped:</span>
                      <span className="font-semibold text-gray-600">
                        {importData.summary.skipped || 0}
                      </span>
                    </div>
                    <div className="border-t pt-3 flex justify-between">
                      <span className="font-medium text-gray-900">Total:</span>
                      <span className="font-bold text-gray-900">
                        {importData.summary.total || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <button
                  onClick={handleClose}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

