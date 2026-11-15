import React from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { clearCachedFamilyPeople } from '../utils/treeCache';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'حدث خطأ غير متوقع أثناء عرض الواجهة.',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  handleClearCacheAndReload = () => {
    clearCachedFamilyPeople();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="flex min-h-[320px] items-center justify-center bg-[#FAF8F4] px-6 py-12 text-[#1C1917]"
        >
          <div className="w-full max-w-lg rounded-xl border border-[#D6CEBE] bg-white p-6 text-center shadow-xs sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="font-heritage mt-4 text-xl font-bold text-[#1C1917]">
              {this.props.fallbackTitle || 'تعذر عرض هذا القسم مؤقتاً'}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#57534E] sm:text-sm">
              حدث خلل مفاجئ أثناء معالجة البيانات. تم إيقاف الخطأ ومنع توقف بقية الموقع.
            </p>
            {this.state.errorMessage && (
              <div
                dir="ltr"
                className="mt-4 rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] px-3 py-2 text-left font-mono text-[11px] text-[#78716C] break-words"
              >
                {this.state.errorMessage}
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-medium text-white hover:bg-[#166534] cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>إعادة المحاولة</span>
              </button>
              <button
                type="button"
                onClick={this.handleClearCacheAndReload}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6CEBE] bg-white px-4 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#F2EFE9] cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 text-[#92400E]" />
                <span>تحديث الصفحة ومسح الذاكرة المؤقتة</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
