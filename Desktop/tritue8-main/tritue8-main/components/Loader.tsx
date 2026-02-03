import { cn } from "@/lib/utils";
import { Compass, GlobeIcon } from "lucide-react";

interface LoaderProps {
  className?: string;
  style?: React.CSSProperties;
  full?: boolean;
  space?: string;
}

const Loader = ({ className, style, full, space }: LoaderProps) => {
  const fullClass = full
    ? "absolute inset-0 flex items-center justify-center"
    : "";
  const spacePixel = space ? space : "124px";
  const fullStyle = {
    backdropFilter: "blur(50px)",
    opacity: 0.9,
    height: `calc(100vh - ${spacePixel})`,
  };
  return (
    <div className={full ? "relative" : ""}>
      <div
        style={{
          ...(full ? fullStyle : {}),
          ...style,
        }}
        className={cn(fullClass, className)}
      >
        <GlobeIcon
          className="text-primary animate-spin"
          style={{ animationDuration: "0.5s" }}
        />
      </div>
    </div>
  );
};

export default Loader;
