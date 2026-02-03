import _ from 'lodash';
import { create } from 'zustand';

export type IQuery = {
    [key: string]: number | string | undefined | null;
    page?: string | number;
    limit?: string | number;
    size?: string | number;
    cursor?: string | null;
    sort?: string;
};

type FilterState = {
    query: IQuery;
    setQuery: (query: IQuery) => void;
    resetQuery: () => void;
};

export const useFilterStore = create<FilterState>((set) => ({
    query: {},
    setQuery: (query: IQuery) => {
        const checkedParams = _.omitBy(query, (value) => value === undefined || value === '' || value === null);
        set({ query: checkedParams as IQuery });
    },
    resetQuery: () => set({ query: {} }),
}));
