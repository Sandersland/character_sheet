import { forwardRef, type TextareaHTMLAttributes } from "react";

import { controlClass } from "@/components/ui/Input";

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea ref={ref} className={`${controlClass} resize-y ${className}`} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export default Textarea;
