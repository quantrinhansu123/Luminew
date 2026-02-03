import { Button, Spin } from "antd";
import React from "react";
import { RollbackOutlined } from "@ant-design/icons";
import { useAdminTitle } from "@/hooks/useAdminTitle";
import Loader from "@/components/Loader";
import { Space } from "antd/lib";

const WrapperContent: React.FC<{
  title: string;
  children: React.ReactNode;
  handleNavigateBack?: () => void;
  toolbar?: React.ReactNode;
  isLoading?: boolean;
  className?: string;
}> = ({
  children,
  handleNavigateBack,
  toolbar,
  isLoading,
  className,
  title,
}) => {
  useAdminTitle(title);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between ">
        <div>
          {handleNavigateBack && (
            <Button
              icon={<RollbackOutlined />}
              onClick={handleNavigateBack}
            ></Button>
          )}
        </div>
        {toolbar}
      </div>
      <Space direction="vertical" className="w-full">
        {!isLoading ? (
          children
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader />
          </div>
        )}
      </Space>
    </div>
  );
};

export default WrapperContent;
