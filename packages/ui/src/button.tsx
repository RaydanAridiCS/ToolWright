import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

/*
 * Buttons are rectangular and a little physical: the primary action carries a hard offset shadow
 * that lifts on hover and presses flat when clicked. Ghost and outline buttons light up with the
 * highlighter marker. No gradients, no glows, no pills.
 */
const lifted = "shadow-md hover:-translate-x-px hover:-translate-y-px hover:shadow-lg active:translate-x-[3px] active:translate-y-[3px] active:shadow-none";

const variants: Record<ButtonVariant, string> = {
  primary: "border border-foreground bg-primary text-primary-foreground",
  secondary: "border border-border bg-secondary text-secondary-foreground hover:border-foreground",
  outline: "border border-foreground/60 bg-card text-foreground hover:border-foreground hover:bg-marker hover:text-marker-foreground",
  ghost: "border border-transparent text-foreground hover:bg-marker hover:text-marker-foreground",
  danger: "border border-foreground bg-danger text-primary-foreground",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-[15px]",
  icon: "size-9 justify-center",
};

export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string): string {
  const raised = (variant === "primary" || variant === "danger") && (size === "md" || size === "lg");
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-semibold transition-[transform,box-shadow,background-color,color,border-color] duration-150",
    "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    raised && lifted,
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}
