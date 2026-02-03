import { create } from 'zustand';

interface ICountState {
    count: number;
    increase: () => void;
}

export const useCountStore = create<ICountState>((set) => ({
    count: 0,
    increase: () => set((state) => ({ count: state.count + 1 })),
}));
