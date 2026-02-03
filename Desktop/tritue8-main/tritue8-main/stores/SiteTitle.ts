import { create } from 'zustand';

export type IUseSiteTitle = {
    title: string | null;
    setSiteTitle: (title: string | null) => void;
};

export const useSiteTitleStore = create<IUseSiteTitle>((set) => ({
    title: null,
    setSiteTitle: (title: string | null) => set(() => ({ title })),
}));
