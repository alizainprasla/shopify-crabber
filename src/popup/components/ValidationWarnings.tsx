import { useState } from 'react';
import type { ValidationResult } from '../../types';

interface ValidationWarningsProps {
  validation: ValidationResult;
}

export function ValidationWarnings({ validation }: ValidationWarningsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;

  if (!hasErrors && !hasWarnings) return null;

  const bgColor = hasErrors ? 'bg-red-50' : 'bg-yellow-50';
  const borderColor = hasErrors ? 'border-red-200' : 'border-yellow-200';
  const iconColor = hasErrors ? 'text-red-500' : 'text-yellow-500';
  const textColor = hasErrors ? 'text-red-800' : 'text-yellow-800';

  return (
    <div className={`card ${bgColor} border ${borderColor} animate-fadeIn`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-5 h-5 ${iconColor}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {hasErrors ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            )}
          </svg>
          <span className={`text-sm font-medium ${textColor}`}>
            {hasErrors
              ? `${validation.errors.length} error${validation.errors.length !== 1 ? 's' : ''}`
              : `${validation.warnings.length} warning${validation.warnings.length !== 1 ? 's' : ''}`}
            {hasErrors && hasWarnings && `, ${validation.warnings.length} warning${validation.warnings.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <svg
          className={`w-4 h-4 ${textColor} transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {validation.errors.map((error, index) => (
            <div
              key={`error-${index}`}
              className="flex items-start gap-2 text-sm text-red-700"
            >
              <span className="text-red-500 mt-0.5">&#10005;</span>
              <span>
                <strong>{error.field}:</strong> {error.message}
              </span>
            </div>
          ))}
          {validation.warnings.map((warning, index) => (
            <div
              key={`warning-${index}`}
              className="flex items-start gap-2 text-sm text-yellow-700"
            >
              <span className="text-yellow-500 mt-0.5">&#9888;</span>
              <span>
                <strong>{warning.field}:</strong> {warning.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
