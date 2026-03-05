import * as React from "react";
import { cn } from "@/lib/utils";

function Separator({ className }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-px w-full bg-border", className)} role="separator" />;
}

export { Separator };
