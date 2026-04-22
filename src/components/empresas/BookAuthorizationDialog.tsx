import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BOOK_TYPE_LABELS, BookType, BookAuthorization } from "@/hooks/useBookAuthorizations";

const schema = z.object({
  book_type: z.enum([
    "libro_compras",
    "libro_ventas",
    "libro_diario",
    "libro_mayor",
    "libro_estados_financieros",
  ]),
  authorization_number: z
    .string()
    .min(1, "Requerido")
    .max(25, "Máximo 25 caracteres"),
  authorization_date: z.string().min(1, "Requerida"),
  authorized_folios: z.coerce.number().int().min(1, "Debe ser mayor a 0"),
  notes: z.string().optional(),
  is_active: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enterpriseId: number;
  authorization: BookAuthorization | null;
  onSubmit: (values: Omit<BookAuthorization, "id" | "created_at" | "updated_at" | "manual_adjustment" | "low_folios_notified_at" | "depleted_notified_at">) => Promise<void>;
}

export function BookAuthorizationDialog({ open, onOpenChange, enterpriseId, authorization, onSubmit }: Props) {
  const { toast } = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      book_type: "libro_compras",
      authorization_number: "",
      authorization_date: new Date().toISOString().split("T")[0],
      authorized_folios: 100,
      notes: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (authorization) {
      form.reset({
        book_type: authorization.book_type,
        authorization_number: authorization.authorization_number,
        authorization_date: authorization.authorization_date,
        authorized_folios: authorization.authorized_folios,
        notes: authorization.notes ?? "",
        is_active: authorization.is_active,
      });
    } else {
      form.reset({
        book_type: "libro_compras",
        authorization_number: "",
        authorization_date: new Date().toISOString().split("T")[0],
        authorized_folios: 100,
        notes: "",
        is_active: true,
      });
    }
  }, [authorization, open, form]);

  const handleSubmit = async (values: FormValues) => {
    try {
      await onSubmit({
        enterprise_id: enterpriseId,
        book_type: values.book_type as BookType,
        authorization_number: values.authorization_number.trim(),
        authorization_date: values.authorization_date,
        authorized_folios: values.authorized_folios,
        notes: values.notes?.trim() || null,
        is_active: values.is_active,
      });
      toast({ title: authorization ? "Autorización actualizada" : "Autorización creada" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{authorization ? "Editar autorización" : "Nueva autorización SAT"}</DialogTitle>
          <DialogDescription>
            Registra los datos de la resolución de habilitación de libros emitida por SAT.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="book_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Libro</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(BOOK_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="authorization_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de autorización</FormLabel>
                  <FormControl>
                    <Input maxLength={25} placeholder="Ej. 2024-1234567-ABC" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="authorization_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de autorización</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="authorized_folios"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Folios autorizados</FormLabel>
                  <FormControl><Input type="number" min={1} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl><Textarea rows={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">{authorization ? "Guardar" : "Crear"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
