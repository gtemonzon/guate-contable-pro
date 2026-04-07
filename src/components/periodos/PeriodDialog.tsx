import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getSafeErrorMessage } from "@/utils/errorMessages";

const formSchema = z.object({
  start_date: z.date({
    required_error: "La fecha de inicio es requerida",
  }),
  end_date: z.date({
    required_error: "La fecha de fin es requerida",
  }),
  notes: z.string().optional(),
}).refine((data) => data.end_date > data.start_date, {
  message: "La fecha de fin debe ser posterior a la fecha de inicio",
  path: ["end_date"],
});

interface PeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period?: any;
  onSuccess: () => void;
}

const PeriodDialog = ({ open, onOpenChange, period, onSuccess }: PeriodDialogProps) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startMonth, setStartMonth] = useState<Date>(new Date());
  const [endMonth, setEndMonth] = useState<Date>(new Date());
  const isEditing = !!period;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      start_date: undefined,
      end_date: undefined,
      notes: "",
    },
  });

  useEffect(() => {
    if (period) {
      const startDate = parseISO(period.start_date);
      const endDate = parseISO(period.end_date);
      form.reset({
        start_date: startDate,
        end_date: endDate,
        notes: period.notes || "",
      });
      setStartMonth(startDate);
      setEndMonth(endDate);
    } else {
      form.reset({
        start_date: undefined,
        end_date: undefined,
        notes: "",
      });
      setStartMonth(new Date());
      setEndMonth(new Date());
    }
  }, [period, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      if (!currentEnterpriseId) {
        throw new Error("No hay empresa seleccionada");
      }

      // Extract year from start_date
      const year = values.start_date.getFullYear();

      // Check for overlapping periods
      const { data: existingPeriods, error: checkError } = await supabase
        .from("tab_accounting_periods")
        .select("id, start_date, end_date")
        .eq("enterprise_id", parseInt(currentEnterpriseId))
        .neq("id", period?.id || 0);

      if (checkError) throw checkError;

      const hasOverlap = existingPeriods?.some((existingPeriod) => {
        const existingStart = new Date(existingPeriod.start_date);
        const existingEnd = new Date(existingPeriod.end_date);
        
        return (
          (values.start_date >= existingStart && values.start_date <= existingEnd) ||
          (values.end_date >= existingStart && values.end_date <= existingEnd) ||
          (values.start_date <= existingStart && values.end_date >= existingEnd)
        );
      });

      if (hasOverlap) {
        toast({
          title: "Error de validación",
          description: "Ya existe un período contable que se superpone con las fechas seleccionadas",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      const periodData = {
        enterprise_id: parseInt(currentEnterpriseId),
        year,
        start_date: format(values.start_date, "yyyy-MM-dd"),
        end_date: format(values.end_date, "yyyy-MM-dd"),
        notes: values.notes || null,
      };

      if (isEditing) {
        const { error } = await supabase
          .from("tab_accounting_periods")
          .update(periodData)
          .eq("id", period.id);

        if (error) throw error;

        toast({
          title: "Período actualizado",
          description: "El período contable ha sido actualizado exitosamente",
        });
      } else {
        const { error } = await supabase
          .from("tab_accounting_periods")
          .insert([periodData]);

        if (error) throw error;

        toast({
          title: "Período creado",
          description: "El período contable ha sido creado exitosamente",
        });
      }

      onSuccess();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Período Contable" : "Nuevo Período Contable"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica las fechas y notas del período contable"
              : "Define las fechas de inicio y fin para el nuevo período contable"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Inicio</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy")
                            ) : (
                              <span>Seleccionar fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date);
                            if (date) setStartMonth(date);
                          }}
                          month={startMonth}
                          onMonthChange={setStartMonth}
                          showYearNavigation
                          yearRange={{ from: 2015, to: 2035 }}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Primer día del período
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Fin</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy")
                            ) : (
                              <span>Seleccionar fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date);
                            if (date) setEndMonth(date);
                          }}
                          month={endMonth}
                          onMonthChange={setEndMonth}
                          showYearNavigation
                          yearRange={{ from: 2015, to: 2035 }}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Último día del período
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ej: Período anual 2025, Período mensual enero 2025, etc."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Agrega información adicional sobre este período
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : isEditing ? "Actualizar" : "Crear Período"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PeriodDialog;
