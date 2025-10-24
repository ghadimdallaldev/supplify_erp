'use client';

import { useEffect, useState } from 'react';

interface ButtonAuditResult {
  testId: string;
  element: HTMLElement;
  type: 'button' | 'link';
  text: string;
  href?: string;
  onClick?: boolean;
  disabled?: boolean;
  working: boolean;
  error?: string;
}

export function useButtonAudit() {
  const [auditResults, setAuditResults] = useState<ButtonAuditResult[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);

  const auditAllButtons = async () => {
    setIsAuditing(true);
    const results: ButtonAuditResult[] = [];

    // Find all buttons and links with data-testid
    const buttons = document.querySelectorAll('[data-testid^="btn-"], [data-testid^="link-"]');
    
    for (const element of buttons) {
      const testId = element.getAttribute('data-testid');
      if (!testId) continue;

      const result: ButtonAuditResult = {
        testId,
        element: element as HTMLElement,
        type: element.tagName.toLowerCase() === 'a' ? 'link' : 'button',
        text: element.textContent?.trim() || '',
        href: element.getAttribute('href') || undefined,
        onClick: !!element.getAttribute('onclick') || !!element.addEventListener,
        disabled: element.hasAttribute('disabled'),
        working: false,
      };

      try {
        // Test if button is clickable
        if (!result.disabled) {
          // Check if it's a link with valid href
          if (result.type === 'link' && result.href) {
            result.working = true;
          } else if (result.type === 'button' && result.onClick) {
            result.working = true;
          } else {
            result.error = 'No click handler or href found';
          }
        } else {
          result.error = 'Button is disabled';
        }
      } catch (error) {
        result.error = error instanceof Error ? error.message : 'Unknown error';
      }

      results.push(result);
    }

    setAuditResults(results);
    setIsAuditing(false);
  };

  const testButtonClick = async (testId: string) => {
    const element = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
    if (!element) return false;

    try {
      // Check if element is visible and clickable
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      // Simulate click
      element.click();
      return true;
    } catch (error) {
      console.error(`Error clicking button ${testId}:`, error);
      return false;
    }
  };

  const getAuditSummary = () => {
    const total = auditResults.length;
    const working = auditResults.filter(r => r.working).length;
    const broken = auditResults.filter(r => !r.working).length;
    
    return {
      total,
      working,
      broken,
      percentage: total > 0 ? Math.round((working / total) * 100) : 0,
    };
  };

  useEffect(() => {
    // Auto-audit on mount
    auditAllButtons();
  }, []);

  return {
    auditResults,
    isAuditing,
    auditAllButtons,
    testButtonClick,
    getAuditSummary,
  };
}

// Component for displaying audit results
export function ButtonAuditPanel() {
  const { auditResults, isAuditing, auditAllButtons, getAuditSummary } = useButtonAudit();
  const summary = getAuditSummary();

  return (
    <div className="fixed bottom-4 left-4 bg-white border border-gray-300 rounded-lg shadow-lg p-4 max-w-md z-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Button Audit</h3>
        <button
          onClick={auditAllButtons}
          disabled={isAuditing}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isAuditing ? 'Auditing...' : 'Refresh'}
        </button>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-sm">
          <span>Total: {summary.total}</span>
          <span className="text-green-600">Working: {summary.working}</span>
          <span className="text-red-600">Broken: {summary.broken}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
          <div
            className="bg-green-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${summary.percentage}%` }}
          />
        </div>
        <div className="text-xs text-gray-600 mt-1">
          {summary.percentage}% working
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {auditResults.map((result) => (
          <div
            key={result.testId}
            className={`flex items-center justify-between p-2 rounded text-sm mb-1 ${
              result.working ? 'bg-green-50' : 'bg-red-50'
            }`}
          >
            <div className="flex-1">
              <div className="font-medium">{result.testId}</div>
              <div className="text-gray-600">{result.text}</div>
              {result.error && (
                <div className="text-red-600 text-xs">{result.error}</div>
              )}
            </div>
            <div className={`w-3 h-3 rounded-full ${
              result.working ? 'bg-green-500' : 'bg-red-500'
            }`} />
          </div>
        ))}
      </div>
    </div>
  );
}
