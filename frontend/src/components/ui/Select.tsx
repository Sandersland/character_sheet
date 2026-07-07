import { forwardRef, type SelectHTMLAttributes } from "react";

import { controlClass } from "@/components/ui/Input";

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", children, ...props }, ref) => (
    <select ref={ref} className={`${controlClass} ${className}`} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export default Select;
