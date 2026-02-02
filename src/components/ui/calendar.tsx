import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  showYearNavigation?: boolean;
  yearRange?: { from: number; to: number };
};

function Calendar({ 
  className, 
  classNames, 
  showOutsideDays = true, 
  showYearNavigation = false,
  yearRange,
  ...props 
}: CalendarProps) {
  const currentYear = new Date().getFullYear();
  const fromYear = yearRange?.from ?? currentYear - 10;
  const toYear = yearRange?.to ?? currentYear + 10;
  
  const years = React.useMemo(() => {
    const yearsArray: number[] = [];
    for (let year = fromYear; year <= toYear; year++) {
      yearsArray.push(year);
    }
    return yearsArray;
  }, [fromYear, toYear]);

  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 pointer-events-auto", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: cn(
          "text-sm font-medium",
          showYearNavigation && "hidden"
        ),
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
        Caption: showYearNavigation ? ({ displayMonth }) => {
          return (
            <div className="flex items-center justify-center gap-1 pt-1 relative z-50">
              <Select
                value={displayMonth.getMonth().toString()}
                onValueChange={(value) => {
                  const newDate = new Date(displayMonth);
                  newDate.setMonth(parseInt(value));
                  props.onMonthChange?.(newDate);
                }}
              >
                <SelectTrigger className="h-7 w-[110px] text-xs font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent 
                  className="pointer-events-auto z-[100]"
                  position="popper"
                  sideOffset={4}
                  hideScrollButtons
                >
                  {months.map((month, index) => (
                    <SelectItem key={month} value={index.toString()} className="text-xs">
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={displayMonth.getFullYear().toString()}
                onValueChange={(value) => {
                  const newDate = new Date(displayMonth);
                  newDate.setFullYear(parseInt(value));
                  props.onMonthChange?.(newDate);
                }}
              >
                <SelectTrigger className="h-7 w-[75px] text-xs font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent 
                  className="pointer-events-auto z-[100] max-h-[200px] overflow-y-auto"
                  position="popper"
                  sideOffset={4}
                  hideScrollButtons
                >
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()} className="text-xs">
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        } : undefined,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
