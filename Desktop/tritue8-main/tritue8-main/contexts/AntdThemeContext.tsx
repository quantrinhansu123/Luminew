import Loader from "@/components/Loader";
import { ConfigProvider, theme } from "antd";
import type { ReactNode } from "react";
import vi from "antd/locale/vi_VN";

export default function AntdThemeContext({
  children,
}: {
  children: ReactNode;
}) {
  // const isDark = useAntdTheme((state) => state.isDark);
  return (
    <ConfigProvider
      locale={vi}
      spin={{
        indicator: <Loader />,
      }}
      prefixCls="talab"
      theme={{
        cssVar: true,
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#36797f", // Màu chủ đạo
          colorInfo: "#36797f", // Đồng bộ màu thông tin
          wireframe: false,
          sizeStep: 5,
          sizeUnit: 2,
          fontSize: 12,
          colorLink: "#36797f", // Link bình thường
          colorLinkHover: "#a5d8dc", // Link hover sáng hơn
          linkHoverDecoration: "underline",
          linkDecoration: "wavy",
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
