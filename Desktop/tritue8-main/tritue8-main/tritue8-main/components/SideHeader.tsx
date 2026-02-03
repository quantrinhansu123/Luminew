import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useSiteTitleStore } from "@/stores/SiteTitle";

export function SiteHeader() {
  const title = useSiteTitleStore((state) => state.title);

  return (
    <header className="h-(--header-height) group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) flex shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="line-clamp-1 text-base font-medium">
          {!title ? <Skeleton className="h-[2.2vw] w-[20vw]" /> : title}
        </h1>
        {/* <div className='ml-auto flex items-center gap-2'>
                    <ModeToggle
                        allowSystem={false}
                        setTheme={handleSetTheme}
                        className='border-none shadow-none focus-visible:ring-0 dark:focus-visible:ring-0'
                    />
                </div> */}
      </div>
    </header>
  );
}
