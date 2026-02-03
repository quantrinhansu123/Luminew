import { create } from 'zustand';

const getSystemTheme = () => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export type IUseAntdTheme = {
    isDark: boolean;
    setThemeAntd: (theme: string) => void;
};

export const useAntdTheme = create<IUseAntdTheme>((set) => ({
    isDark: getSystemTheme() === 'dark',
    setThemeAntd: (theme: string) => set(() => ({ isDark: theme === 'dark' })),
}));
