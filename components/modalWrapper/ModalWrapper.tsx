"use client";

import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalWrapperProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

const ModalWrapper = ({
  isOpen,
  onClose,
  children,
  title,
}: ModalWrapperProps) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-10">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg relative max-h-full overflow-auto p-6">
        <button
          className="absolute top-3 right-3 text-gray-500 hover:text-black dark:hover:text-white transition"
          onClick={onClose}
          aria-label="Close modal"
        >
          <X size={20} />
        </button>
        {title && <h2 className="text-xl font-semibold mb-4">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body
  );
};

export default ModalWrapper;
