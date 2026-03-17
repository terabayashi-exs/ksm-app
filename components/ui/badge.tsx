import * as React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "error" | "info" | "muted";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const baseClasses = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors";

  const variantClasses = {
    default: "border-transparent bg-primary text-primary-foreground",
    secondary: "border-transparent bg-gray-100 text-gray-700",
    destructive: "border-transparent bg-destructive text-destructive-foreground",
    outline: "border-gray-200 text-gray-900",
    success: "border-transparent bg-green-100 text-green-800",
    warning: "border-transparent bg-yellow-100 text-yellow-800",
    error: "border-transparent bg-red-100 text-red-800",
    info: "border-transparent bg-blue-100 text-blue-800",
    muted: "border-transparent bg-gray-100 text-gray-600",
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${className || ''}`;

  return (
    <div className={classes} {...props} />
  )
}

export { Badge }
