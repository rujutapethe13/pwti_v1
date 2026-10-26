"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";

type SelectContextValue = {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  disabled?: boolean;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

const useSelectContext = () => {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("Select components must be used within Select");
  return context;
};

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

const Select = ({
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  disabled,
  children,
}: SelectProps) => {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  const value = controlledValue !== undefined ? controlledValue : uncontrolledValue;
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (controlledValue === undefined) {
        setUncontrolledValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [controlledValue, onValueChange],
  );

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (disabled) return;
      if (controlledOpen === undefined) {
        setUncontrolledOpen(newOpen);
      }
      onOpenChange?.(newOpen);
    },
    [controlledOpen, disabled, onOpenChange],
  );

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange: handleValueChange,
        open,
        setOpen: handleOpenChange,
        triggerRef,
        disabled,
      }}
    >
      {children}
    </SelectContext.Provider>
  );
};
Select.displayName = "Select";

const SelectGroup = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
const SelectLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("px-2 py-1.5 text-sm font-semibold", className)}>{children}</div>
);
const SelectSeparator = ({ className }: { className?: string }) => (
  <div className={cn("-mx-1 my-1 h-px bg-border", className)} />
);

const SelectValue = ({
  placeholder,
  className,
  children,
}: {
  placeholder?: string;
  className?: string;
  children?: React.ReactNode;
}) => {
  const { value } = useSelectContext();
  const displayValue = value || placeholder || "";
  return (
    <span className={cn("block truncate", className)}>
      {children ?? displayValue}
    </span>
  );
};

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const { open, setOpen, triggerRef, disabled } = useSelectContext();
  const combinedRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      (triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
      }
    },
    [ref, triggerRef],
  );

  return (
    <button
      ref={combinedRef}
      type="button"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(!open);
      }}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  );
});
SelectTrigger.displayName = "SelectTrigger";

const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, children, value, ...props }, ref) => {
  const { value: selectedValue, onValueChange, setOpen } = useSelectContext();
  const isSelected = selectedValue === value;

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isSelected}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onValueChange(value);
        setOpen(false);
      }}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-[4px] h-[40px] px-[12px] py-[8px] text-[14px] outline-none",
        "hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <span className="flex-1 truncate pr-[28px]">{children}</span>
      <span className="absolute right-[12px] flex h-[20px] w-[20px] items-center justify-center">
        {isSelected && <Check className="h-4 w-4 text-brand" />}
      </span>
    </div>
  );
});
SelectItem.displayName = "SelectItem";

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { sideOffset?: number }
>(({ className, children, sideOffset, ...props }, ref) => {
  const { open, setOpen, triggerRef } = useSelectContext();
  const [position, setPosition] = React.useState({ top: 0, left: 0, width: 0 });
  const contentRef = React.useRef<HTMLDivElement>(null);

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    const offset = sideOffset ?? 0;
    let top = rect.bottom + 4 + offset;
    let flipAbove = false;
    if (spaceBelow < 200 && spaceAbove > spaceBelow) {
      flipAbove = true;
      top = rect.top - 4 - offset;
    }
    
    setPosition({
      top: flipAbove ? Math.max(8, rect.top - 200 - offset) : top,
      left: rect.left,
      width: rect.width,
    });
  }, [triggerRef, sideOffset]);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();
    
    const handleScroll = (e: Event) => {
      if (contentRef.current && contentRef.current.contains(e.target as Node)) {
        return;
      }
      updatePosition();
    };
    
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", updatePosition);
    
    const timeoutId = setTimeout(updatePosition, 0);
    
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", updatePosition);
      clearTimeout(timeoutId);
    };
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        contentRef.current &&
        !contentRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, setOpen, triggerRef]);

  React.useEffect(() => {
    if (!open || !triggerRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            setOpen(false);
          }
        });
      },
      { threshold: 0 }
    );
    
    observer.observe(triggerRef.current);
    return () => observer.disconnect();
  }, [open, setOpen, triggerRef]);

  if (!open) return null;

  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 600;
  const maxHeight = Math.max(100, viewportHeight - 16);
  
  const panel = (
    <div
      ref={(node) => {
        contentRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      }}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: position.width,
        zIndex: 10001,
        maxHeight: maxHeight,
        overflowY: "auto",
      }}
      className={cn(
        "rounded-[8px] border border-popover-border bg-popover-bg p-[4px] text-[14px] text-foreground shadow-popover",
        className,
      )}
      onMouseDown={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(panel, document.body);
});
SelectContent.displayName = "SelectContent";

const SelectScrollUpButton = () => null;
const SelectScrollDownButton = () => null;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
