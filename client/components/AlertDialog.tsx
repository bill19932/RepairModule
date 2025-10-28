import { useState } from 'react';

interface AlertDialogProps {
  title?: string;
  message: string;
  isOpen: boolean;
  onClose: () => void;
  type?: 'success' | 'error' | 'info' | 'warning';
}

export function AlertDialog({ title, message, isOpen, onClose, type = 'info' }: AlertDialogProps) {
  if (!isOpen) return null;

  const bgColor = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
    warning: 'bg-yellow-50 border-yellow-200',
  }[type];

  const titleColor = {
    success: 'text-green-900',
    error: 'text-red-900',
    info: 'text-blue-900',
    warning: 'text-yellow-900',
  }[type];

  const buttonColor = {
    success: 'bg-green-600 hover:bg-green-700',
    error: 'bg-red-600 hover:bg-red-700',
    info: 'bg-blue-600 hover:bg-blue-700',
    warning: 'bg-yellow-600 hover:bg-yellow-700',
  }[type];

  const icon = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️',
  }[type];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={`${bgColor} border rounded-lg shadow-xl max-w-md w-full mx-4 p-6`}>
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl">{icon}</span>
          {title && <h2 className={`text-lg font-bold ${titleColor}`}>{title}</h2>}
        </div>
        <p className="text-gray-700 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className={`${buttonColor} text-white font-semibold px-4 py-2 rounded-lg transition-colors`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for easier usage
export function useAlert() {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info' as const,
  });

  const show = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', title?: string) => {
    setState({ isOpen: true, message, type, title: title || '' });
  };

  const close = () => {
    setState(prev => ({ ...prev, isOpen: false }));
  };

  return { ...state, show, close };
}
