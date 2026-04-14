import { Outlet } from "react-router-dom";
import { SidebarNav } from "@/components/nav/SidebarNav";

export function AppLayout() {
  return (
    <div className="app-shell">
      <SidebarNav />
      <div className="app-shell__content">
        <div className="app-shell__frame">
          <main className="app-shell__page">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
