'use client';

import React, { useState, useCallback } from 'react';
import { X, UploadCloud, FileText, Download, Loader2, CheckCircle, AlertTriangle, Package, ShoppingCart } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: (count: number) => void;
  entityType: 'restaurant' | 'supplier';
  entityId: string;
}

export function BulkUploadModal({ isOpen, onClose, onUploadSuccess, entityType, entityId }: BulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; errors?: string[]; items?: any[] } | null>(null);
  const [uploadType, setUploadType] = useState<'inventory' | 'products'>('inventory');
  const { toast } = useToast();

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setUploadResult(null);
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      setFile(event.dataTransfer.files[0]);
      setUploadResult(null);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select an Excel or CSV file to upload.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', 'current-user'); // In real app, get from auth context

    try {
      let endpoint = '';
      if (entityType === 'restaurant' && uploadType === 'inventory') {
        endpoint = '/api/bulk-upload/restaurant-inventory';
        formData.append('restaurantId', entityId);
      } else if (entityType === 'supplier' && uploadType === 'products') {
        endpoint = '/api/bulk-upload/supplier-products';
        formData.append('supplierId', entityId);
      } else {
        throw new Error('Invalid upload type for entity');
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        setUploadResult(result);
        
        if (result.success) {
          toast({
            title: 'Upload Successful',
            description: result.message,
            variant: 'default',
          });
          onUploadSuccess?.(result.processedRows);
          setFile(null);
        } else {
          toast({
            title: 'Upload Completed with Errors',
            description: `${result.processedRows}/${result.totalRows} items processed successfully`,
            variant: 'destructive',
          });
        }
      } else {
        const error = await response.text();
        throw new Error(error || 'Upload failed');
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadResult({ 
        success: false, 
        message: `Upload failed: ${error.message}`, 
        errors: [error.message] 
      });
      toast({
        title: 'Upload Error',
        description: `Failed to upload file: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [file, entityType, entityId, uploadType, onUploadSuccess, toast]);

  const handleDownloadTemplate = useCallback(() => {
    const templateType = entityType === 'restaurant' ? 'restaurant-inventory' : 'supplier-products';
    
    // Download template from server
    fetch(`/api/bulk-upload/template/${templateType}`)
      .then(response => response.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${templateType}_template.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      })
      .catch(error => {
        console.error('Template download failed:', error);
        toast({
          title: 'Download Failed',
          description: 'Failed to download template. Please try again.',
          variant: 'destructive',
        });
      });
  }, [entityType, toast]);

  if (!isOpen) return null;

  const isRestaurant = entityType === 'restaurant';
  const title = isRestaurant ? 'Bulk Upload Inventory' : 'Bulk Upload Products';
  const description = isRestaurant 
    ? 'Upload an Excel file to add multiple inventory items at once'
    : 'Upload an Excel file to add multiple products to your catalog';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isRestaurant ? (
              <ShoppingCart className="h-6 w-6 text-blue-600" />
            ) : (
              <Package className="h-6 w-6 text-green-600" />
            )}
            <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <p className="text-gray-600 mb-4">{description}</p>

          {/* Upload Type Selection for Restaurants */}
          {isRestaurant && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Type
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="inventory"
                    checked={uploadType === 'inventory'}
                    onChange={(e) => setUploadType(e.target.value as 'inventory' | 'products')}
                    className="mr-2"
                  />
                  <span className="text-sm">Inventory Items</span>
                </label>
              </div>
            </div>
          )}

          {/* File Upload Area */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors mb-6"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => document.getElementById('fileInput')?.click()}
          >
            <input
              id="fileInput"
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <UploadCloud className="mx-auto h-12 w-12 text-gray-400 mb-3" />
            {file ? (
              <p className="text-gray-700 font-medium">{file.name}</p>
            ) : (
              <>
                <p className="text-gray-700 font-medium">Drag & drop your file here, or click to select</p>
                <p className="text-sm text-gray-500">Supports .xlsx, .xls, .csv</p>
              </>
            )}
          </div>

          {/* Upload Result */}
          {uploadResult && (
            <div className={`p-4 rounded-lg mb-6 ${uploadResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <div className="flex items-center mb-2">
                {uploadResult.success ? <CheckCircle className="h-5 w-5 mr-2" /> : <AlertTriangle className="h-5 w-5 mr-2" />}
                <p className="font-semibold">{uploadResult.message}</p>
              </div>
              {uploadResult.errors && uploadResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium mb-1">Errors:</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {uploadResult.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              {uploadResult.items && uploadResult.items.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium mb-1">Successfully processed:</p>
                  <ul className="text-sm space-y-1">
                    {uploadResult.items.slice(0, 5).map((item, index) => (
                      <li key={index}>• {item.name}</li>
                    ))}
                    {uploadResult.items.length > 5 && (
                      <li>... and {uploadResult.items.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between items-center mb-6">
            <Button
              variant="outline"
              onClick={handleDownloadTemplate}
              className="flex items-center space-x-2"
            >
              <Download className="h-4 w-4" />
              <span>Download Template</span>
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || isLoading}
              className="min-w-[120px]"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UploadCloud className="h-4 w-4 mr-2" />
              )}
              {isLoading ? 'Uploading...' : 'Upload File'}
            </Button>
          </div>

          {/* Guidelines */}
          <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700">
            <h4 className="font-semibold mb-2">Template Guidelines:</h4>
            {isRestaurant ? (
              <ul className="list-disc list-inside space-y-1">
                <li>Required fields: Item Name, Storage Type, UOM, Quantity, Unit Cost</li>
                <li>Storage Type must be: DRY, CHILL, FREEZE, or CHEMICAL</li>
                <li>Quantity and Unit Cost must be valid numbers</li>
                <li>Each row represents a unique inventory item</li>
                <li>Items will be created if they don't exist, or updated if they do</li>
              </ul>
            ) : (
              <ul className="list-disc list-inside space-y-1">
                <li>Required fields: Product Name, SKU, Category, Price, Unit</li>
                <li>Price must be a positive number</li>
                <li>Each row represents a unique product</li>
                <li>Products will be added to your catalog</li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}