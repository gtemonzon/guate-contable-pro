import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface Account {
  id: number;
  account_code: string;
  account_name: string;
}

interface AccountComboboxProps {
  accounts: Account[];
  value: number | null;
  onValueChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function AccountCombobox({
  accounts,
  value,
  onValueChange,
  placeholder = "Seleccionar cuenta...",
  disabled = false,
  className,
}: AccountComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedAccount = accounts.find((account) => account.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between h-8 text-xs", className)}
          disabled={disabled}
        >
          {selectedAccount
            ? `${selectedAccount.account_code} - ${selectedAccount.account_name}`
            : placeholder}
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command
          onKeyDown={(e) => {
            // Allow Enter to select the highlighted item and close
            if (e.key === "Enter") {
              // cmdk handles selection internally; just ensure popover closes after
              setTimeout(() => setOpen(false), 0);
            }
          }}
        >
          <CommandInput placeholder="Buscar cuenta..." className="h-9" />
          <CommandEmpty>No se encontró cuenta.</CommandEmpty>
          <CommandGroup className="max-h-[300px] overflow-auto">
            {accounts.map((account) => (
              <CommandItem
                key={account.id}
                value={`${account.account_code} ${account.account_name}`}
                onSelect={() => {
                  onValueChange(account.id === value ? null : account.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === account.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="text-xs">
                  {account.account_code} - {account.account_name}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
