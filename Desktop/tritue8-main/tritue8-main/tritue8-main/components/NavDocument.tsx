import { type Icon } from "@tabler/icons-react";

import { NavLink } from "react-router-dom";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { navLinkStatus } from "@/utils/navLinkStatus";

export function NavDocuments({
  items,
}: {
  items: {
    name: string;
    url: string;
    icon: Icon;
  }[];
}) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      {/* <SidebarGroupLabel>Tài liệu</SidebarGroupLabel> */}
      <SidebarMenu>
        {items.map((item) => (
          <NavLink
            to={item.url}
            key={item.name + item.url}
            end
            className={navLinkStatus}
          >
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <div className="flex items-center gap-2">
                  <item.icon />
                  <span>{item.name}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </NavLink>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
