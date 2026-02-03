import { AppSidebar } from "@/components/Sidebar";
import { SiteHeader } from "@/components/SideHeader";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Suspense } from "@/routes/lazy";
import { Outlet, Navigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Loader from "@/components/Loader";

export default function AdminLayout() {
  const { currentUser, userProfile, loading } = useAuth();
  const location = useLocation();

  // Show a simple loader while auth state is resolving
  // But only if we don't have a currentUser yet (to avoid redirect during restore)
  if (loading && !currentUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader full/>
      </div>
    );
  }

  // If not authenticated and not loading, redirect to login with current location to return after login
  // Only redirect if we're sure user is not authenticated (not just loading)
  if (!loading && !currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If still loading but we have currentUser (restored from localStorage), show content
  // This prevents redirect during the brief moment when onAuthStateChanged is checking
  if (loading && currentUser) {
    // User is restored, just wait for auth check to complete
    // Show content instead of loader to avoid flicker
  }

  // If user is parent, redirect to parent portal
  if (userProfile?.role === "parent") {
    return <Navigate to="/parent-portal" replace />;
  }

  // Authorization: require admin or teacher
  // Parents are not allowed in workspace
  console.log(userProfile,'sdfsdfsdfsdfs')
  
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as any
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="px-4 lg:px-6">
                <Suspense>
                  <Outlet />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
