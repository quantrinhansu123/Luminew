import { useLayoutEffect } from 'react';
import { useSiteTitleStore } from '@/stores/SiteTitle';

const useAdminTitle = (title: string | null) => {
    const setTitleSite = useSiteTitleStore((s) => s.setSiteTitle);
    // biome-ignore lint/correctness/useExhaustiveDependencies: <>
    useLayoutEffect(() => {
        setTitleSite(title);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title]);
};

export { useAdminTitle };
