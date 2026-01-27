import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import * as React from "react"

const Checkbox = React.forwardRef(({ className, checked, onCheckedChange, ...props }, ref) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        ref={ref}
        className={cn(
            "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
            checked ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300",
            className
        )}
        onClick={() => onCheckedChange?.(!checked)}
        {...props}
    >
        {checked && (
            <div className="flex items-center justify-center text-current">
                <Check className="h-3 w-3" />
            </div>
        )}
    </button>
))
Checkbox.displayName = "Checkbox"

export { Checkbox }

