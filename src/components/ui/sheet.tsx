"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

/**
 * A panel anchored to an edge of the screen, used for the mobile navigation
 * drawer (left) and the mobile "Me" sheet (bottom).
 *
 * Built here rather than by composing `components/ui/dialog`, because that
 * component hardcodes `bg-white` and `text-gray-900`, which render a white
 * modal in dark mode. These variants read the theme tokens instead.
 *
 * Accessibility comes from Radix: focus is trapped while open, Escape closes,
 * and the content is labelled by its title.
 */

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[var(--z-overlay)] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

const SIDE_CLASSES = {
  left: "inset-y-0 left-0 h-full w-[280px] max-w-[85vw] border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
  right:
    "inset-y-0 right-0 h-full w-[320px] max-w-[90vw] border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
  bottom:
    "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
} as const;

export type SheetSide = keyof typeof SIDE_CLASSES;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: SheetSide;
    /** Hide the corner close button where the surface supplies its own. */
    hideClose?: boolean;
  }
>(({ className, children, side = "right", hideClose, ...props }, ref) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-[9999] flex flex-col gap-0 duration-200",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          SIDE_CLASSES[side],
          className,
        )}
        style={{
          backgroundColor: isDark ? "#1f1f23" : "#ffffff",
          borderColor: isDark ? "#3a3a40" : "#e5e5e5",
          boxShadow: isDark
            ? "0 20px 50px rgba(0,0,0,0.5)"
            : "0 20px 50px rgba(0,0,0,0.3)",
          color: isDark ? "#ffffff" : "#1a1a2e",
        }}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-md text-muted-foreground opacity-80 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = "SheetContent";

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1 p-4", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      style={{
        borderTopColor: isDark ? "#3a3a40" : "#e5e5e5",
      }}
      {...props}
    />
  );
};
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-display text-lg text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetOverlay,
  SheetPortal,
};