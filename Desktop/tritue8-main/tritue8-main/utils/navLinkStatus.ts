export const navLinkStatus = ({
    isActive,
    isPending,
    isTransitioning,
}: {
    isActive: boolean;
    isPending: boolean;
    isTransitioning: boolean;
}) =>
    [
        'block cursor-pointer rounded-md transition-colors duration-200 transition-transform duration-200 hover:scale-105 active:scale-95',
        isPending ? 'rounded-md opacity-40 animate-pulse' : '',
        isActive ? '!bg-primary rounded-md text-white' : '',
        isTransitioning ? 'animate-pulse duration-200' : '',
    ].join(' ');
