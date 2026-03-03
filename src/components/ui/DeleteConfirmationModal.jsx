import React from 'react';
import { createPortal } from 'react-dom';

/**
 * A custom confirmation modal styled to match the requested design.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {string} props.title - The title of the modal (e.g., "Delete group?")
 * @param {string} props.itemName - The name of the item being deleted
 * @param {string} props.description - Optional additional description
 * @param {string} props.confirmLabel - Label for the confirm button (default: "Delete")
 * @param {string} props.confirmColor - Tailwind classes for confirm button bg+ring (default: red)
 * @param {Function} props.onConfirm - Callback when confirm is clicked
 * @param {Function} props.onCancel - Callback when Cancel is clicked
 */
export default function DeleteConfirmationModal({
    isOpen,
    title = "Confirm",
    itemName,
    description,
    confirmLabel = "Delete",
    confirmColor = "bg-red-500 hover:bg-red-600 ring-red-500",
    onConfirm,
    onCancel
}) {
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
                onClick={onCancel}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-[400px] bg-white dark:bg-[#1a1a1a] rounded-[24px] shadow-2xl overflow-hidden animate-scale-in border border-gray-200 dark:border-white/5">
                <div className="p-6">
                    <h3 className="text-[20px] font-semibold text-gray-900 dark:text-white mb-4">
                        {title}
                    </h3>

                    <div className="text-[15px] text-gray-500 dark:text-[#9a9a9a] leading-relaxed mb-8">
                        <p>
                            This will {confirmLabel.toLowerCase()} <span className="text-gray-900 dark:text-white font-bold">{itemName}</span>.
                        </p>
                        {description && (
                            <p className="mt-2 text-[13px] opacity-80">
                                {description}
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end items-center gap-3">
                        <button
                            onClick={onCancel}
                            className="px-6 py-2.5 rounded-full text-[14px] font-semibold text-gray-700 dark:text-white bg-gray-100 dark:bg-[#333333] hover:bg-gray-200 dark:hover:bg-[#444444] transition-all active:scale-95"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`px-6 py-2.5 rounded-full text-[14px] font-semibold text-white ${confirmColor} transition-all active:scale-95 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#1a1a1a]`}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
