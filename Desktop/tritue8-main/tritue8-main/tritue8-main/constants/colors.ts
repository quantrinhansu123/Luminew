/**
 * 🎨 COLOR CONSTANTS - Unified brand colors and subject colors
 * Centralized color management for consistent styling across the app
 */

// Brand colors - Primary identity colors
export const BRAND_COLORS = {
  primary: '#36797f',
  secondary: '#36797f',
  light: '#f8e8e9',
  dark: '#4a0f12',
} as const;

// Subject color mapping - Used for schedule cards and events
export const SUBJECT_COLORS = {
  Mathematics: {
    bg: 'bg-blue-50',
    border: 'border-l-blue-500',
    text: 'text-blue-700',
  },
  Chemistry: {
    bg: 'bg-green-50',
    border: 'border-l-green-500',
    text: 'text-green-700',
  },
  Physics: {
    bg: 'bg-purple-50',
    border: 'border-l-purple-500',
    text: 'text-purple-700',
  },
  Biology: {
    bg: 'bg-emerald-50',
    border: 'border-l-emerald-500',
    text: 'text-emerald-700',
  },
  Economics: {
    bg: 'bg-yellow-50',
    border: 'border-l-yellow-600',
    text: 'text-yellow-700',
  },
  Business: {
    bg: 'bg-orange-50',
    border: 'border-l-orange-500',
    text: 'text-orange-700',
  },
  Psychology: {
    bg: 'bg-pink-50',
    border: 'border-l-pink-500',
    text: 'text-pink-700',
  },
  Literature: {
    bg: 'bg-red-50',
    border: 'border-l-red-500',
    text: 'text-red-700',
  },
  English: {
    bg: 'bg-indigo-50',
    border: 'border-l-indigo-500',
    text: 'text-indigo-700',
  },
  Chinese: {
    bg: 'bg-rose-50',
    border: 'border-l-rose-500',
    text: 'text-rose-700',
  },
  default: {
    bg: 'bg-gray-50',
    border: 'border-l-gray-500',
    text: 'text-gray-700',
  },
} as const;

// Status colors
export const STATUS_COLORS = {
  success: 'text-green-600',
  warning: 'text-yellow-600',
  error: 'text-red-600',
  info: 'text-blue-600',
} as const;

// Gradient classes
export const GRADIENTS = {
  brand: 'bg-linear-to-r from-[#36797f] to-[#36797f]',
  brandVertical: 'bg-linear-to-b from-[#36797f] to-[#36797f]',
} as const;
