'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Camera } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string, data?: any) => void;
  onClose: () => void;
}

/**
 * Barcode Scanner Component
 * Uses device camera with BarcodeDetector API (with fallback)
 * Supports GS1 barcode parsing for GTIN, lot, expiry
 */
export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState('');
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Use back camera on mobile
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsScanning(true);

        // Check if BarcodeDetector is available
        if ('BarcodeDetector' in window) {
          startBarcodeDetection();
        } else {
          setUseFallback(true);
          setError('Barcode detection not supported. Please enter manually or use a newer browser.');
        }
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Unable to access camera. Please check permissions.');
      setUseFallback(true);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const startBarcodeDetection = async () => {
    if (!('BarcodeDetector' in window)) return;

    try {
      const barcodeDetector = new (window as any).BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'data_matrix'],
      });

      const detectBarcodes = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          const barcodes = await barcodeDetector.detect(canvas);
          
          if (barcodes.length > 0) {
            const barcode = barcodes[0];
            handleBarcodeDetected(barcode.rawValue);
            return;
          }
        } catch (err) {
          console.error('Detection error:', err);
        }

        // Continue scanning
        if (isScanning) {
          requestAnimationFrame(detectBarcodes);
        }
      };

      detectBarcodes();
    } catch (err) {
      console.error('BarcodeDetector error:', err);
      setUseFallback(true);
    }
  };

  const handleBarcodeDetected = (rawValue: string) => {
    setIsScanning(false);
    stopCamera();

    // Parse GS1 if present (starts with ]d2 or similar)
    const parsedData = parseGS1Barcode(rawValue);
    
    onScan(rawValue, parsedData);
  };

  const parseGS1Barcode = (barcode: string) => {
    // GS1 Application Identifiers:
    // (01) = GTIN
    // (10) = Batch/Lot
    // (17) = Expiry Date (YYMMDD)
    // (15) = Best Before Date
    
    const data: any = {
      raw: barcode,
    };

    // Simple GS1 parser
    const gs1Regex = /\((\d{2})\)([^\(]+)/g;
    let match;

    while ((match = gs1Regex.exec(barcode)) !== null) {
      const ai = match[1];
      const value = match[2].trim();

      switch (ai) {
        case '01': // GTIN
          data.gtin = value;
          break;
        case '10': // Batch/Lot
          data.lotCode = value;
          break;
        case '17': // Expiry Date
          data.expiryDate = parseGS1Date(value);
          break;
        case '15': // Best Before
          data.bestBefore = parseGS1Date(value);
          break;
      }
    }

    // If no GS1, treat as simple barcode
    if (!data.gtin && barcode.match(/^\d{8,14}$/)) {
      data.gtin = barcode;
    }

    return data;
  };

  const parseGS1Date = (dateStr: string): string | null => {
    // GS1 date format: YYMMDD
    if (dateStr.length !== 6) return null;

    const yy = parseInt(dateStr.substring(0, 2));
    const mm = parseInt(dateStr.substring(2, 4));
    const dd = parseInt(dateStr.substring(4, 6));

    // Assume 20xx for year
    const year = 2000 + yy;

    const date = new Date(year, mm - 1, dd);
    return date.toISOString().split('T')[0];
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualEntry.trim()) {
      const parsedData = parseGS1Barcode(manualEntry);
      onScan(manualEntry, parsedData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Scan Barcode</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Camera View */}
        {!useFallback && (
          <div className="relative bg-black">
            <video
              ref={videoRef}
              className="w-full"
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="hidden"
            />
            
            {isScanning && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="border-4 border-blue-500 rounded-lg w-64 h-48 animate-pulse"></div>
              </div>
            )}

            {isScanning && (
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <p className="text-white text-sm bg-black bg-opacity-50 inline-block px-4 py-2 rounded">
                  Position barcode within the frame
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400">
            <p className="text-sm text-yellow-700">{error}</p>
          </div>
        )}

        {/* Manual Entry Fallback */}
        <div className="p-4">
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or enter barcode manually:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualEntry}
                  onChange={(e) => setManualEntry(e.target.value)}
                  placeholder="Enter barcode number..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus={useFallback}
                />
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-lg transition-colors"
                >
                  Submit
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              <p>Supports: EAN-13, EAN-8, Code 128, QR codes, GS1 barcodes</p>
              <p className="mt-1">GS1 format example: (01)12345678901234(10)LOT123(17)250630</p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

