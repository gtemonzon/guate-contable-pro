import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Database } from "@/integrations/supabase/types";

type Account = Database['public']['Tables']['tab_accounts']['Row'];

const formSchema = z.object({
  account_code: z.string().min(1, "Código es requerido"),
  account_name: z.string().min(1, "Nombre es requerido"),
  account_type: z.enum(["activo", "pasivo", "capital", "ingreso", "gasto", "costo"]),
  parent_account_id: z.number().nullable(),
  level: z.number().min(1).max(10),
  is_detail_account: z.boolean().default(false),
  allows_movement: z.boolean().default(true),
  requires_cost_center: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  enterpriseId: number | null;
  accounts: Account[];
  onSuccess: () => void;
}

export function AccountDialog({
  open,
  onOpenChange,
  account,
  enterpriseId,
  accounts,
  onSuccess,
}: AccountDialogProps) {
  const { toast } = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      account_code: "",
      account_name: "",
      account_type: "activo",
      parent_account_id: null,
      level: 1,
      is_detail_account: false,
      allows_movement: true,
      requires_cost_center: false,
      is_active: true,
    },
  });

  // Calcular nivel y cuenta padre automáticamente basado en el código
  const calculateLevelAndParent = (code: string) => {
    // Calcular nivel basado en la cantidad de puntos
    const level = code.split('.').length;
    
    // Buscar cuenta padre automáticamente
    let parentAccountId = null;
    if (level > 1) {
      const parentCode = code.split('.').slice(0, -1).join('.');
      const parentAccount = accounts.find(acc => acc.account_code === parentCode);
      if (parentAccount) {
        parentAccountId = parentAccount.id;
      }
    }
    
    return { level, parentAccountId };
  };

  // Calcular el siguiente código sugerido
  const getNextSuggestedCode = () => {
    if (accounts.length === 0) return "1";
    
    const sortedCodes = accounts
      .map(acc => acc.account_code)
      .sort((a, b) => {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aVal = aParts[i] || 0;
          const bVal = bParts[i] || 0;
          if (aVal !== bVal) return aVal - bVal;
        }
        return 0;
      });
    
    const lastCode = sortedCodes[sortedCodes.length - 1];
    const parts = lastCode.split('.');
    const lastPart = parseInt(parts[parts.length - 1]) + 1;
    parts[parts.length - 1] = lastPart.toString().padStart(parts[parts.length - 1].length, '0');
    return parts.join('.');
  };

  useEffect(() => {
    if (account) {
      form.reset({
        account_code: account.account_code,
        account_name: account.account_name,
        account_type: account.account_type as any,
        parent_account_id: account.parent_account_id,
        level: account.level,
        is_detail_account: account.is_detail_account ?? false,
        allows_movement: account.allows_movement ?? true,
        requires_cost_center: account.requires_cost_center ?? false,
        is_active: account.is_active ?? true,
      });
    } else {
      const suggestedCode = getNextSuggestedCode();
      const { level, parentAccountId } = calculateLevelAndParent(suggestedCode);
      
      form.reset({
        account_code: suggestedCode,
        account_name: "",
        account_type: "activo",
        parent_account_id: parentAccountId,
        level: level,
        is_detail_account: false,
        allows_movement: true,
        requires_cost_center: false,
        is_active: true,
      });
    }
  }, [account, accounts]);

  // Manejar cambio de código
  const handleCodeChange = (code: string) => {
    form.setValue('account_code', code);
    const { level, parentAccountId } = calculateLevelAndParent(code);
    form.setValue('level', level);
    form.setValue('parent_account_id', parentAccountId);
  };

  const onSubmit = async (values: FormValues) => {
    if (!enterpriseId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No hay empresa seleccionada",
      });
      return;
    }

    // Validar código duplicado
    const existingAccount = accounts.find(
      acc => acc.account_code === values.account_code && acc.id !== account?.id
    );
    
    if (existingAccount) {
      toast({
        variant: "destructive",
        title: "Código Duplicado",
        description: "Este código de cuenta ya existe para esta empresa, no se puede duplicar",
      });
      return;
    }

    try {
      const dataToSave: Database['public']['Tables']['tab_accounts']['Insert'] = {
        enterprise_id: enterpriseId,
        account_code: values.account_code,
        account_name: values.account_name,
        account_type: values.account_type,
        parent_account_id: values.parent_account_id,
        level: values.level,
        is_detail_account: values.is_detail_account,
        allows_movement: values.allows_movement,
        requires_cost_center: values.requires_cost_center,
        is_active: values.is_active,
      };

      if (account) {
        const { error } = await supabase
          .from("tab_accounts")
          .update(dataToSave)
          .eq("id", account.id);

        if (error) throw error;

        toast({
          title: "Cuenta actualizada",
          description: "Los datos se guardaron correctamente",
        });
      } else {
        const { error } = await supabase
          .from("tab_accounts")
          .insert([dataToSave]);

        if (error) throw error;

        toast({
          title: "Cuenta creada",
          description: "La cuenta se registró exitosamente",
        });
      }

      onSuccess();
      form.reset();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const parentAccounts = accounts.filter(
    (acc) => !acc.is_detail_account && acc.id !== account?.id
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {account ? "Editar Cuenta" : "Nueva Cuenta"}
          </DialogTitle>
          <DialogDescription>
            {account
              ? "Modifica los datos de la cuenta contable"
              : "Registra una nueva cuenta en el catálogo"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="account_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="1.1.1.01" 
                        {...field}
                        onChange={(e) => handleCodeChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nivel (automático)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        disabled
                        className="bg-muted"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="account_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Cuenta</FormLabel>
                  <FormControl>
                    <Input placeholder="Caja General" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="account_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Cuenta</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="activo">Activo</SelectItem>
                        <SelectItem value="pasivo">Pasivo</SelectItem>
                        <SelectItem value="capital">Capital</SelectItem>
                        <SelectItem value="ingreso">Ingreso</SelectItem>
                        <SelectItem value="gasto">Gasto</SelectItem>
                        <SelectItem value="costo">Costo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="parent_account_id"
                render={({ field }) => {
                  const parentAccount = accounts.find(acc => acc.id === field.value);
                  return (
                    <FormItem>
                      <FormLabel>Cuenta Padre (automático)</FormLabel>
                      <FormControl>
                        <Input
                          value={parentAccount ? `${parentAccount.account_code} - ${parentAccount.account_name}` : "Sin cuenta padre"}
                          disabled
                          className="bg-muted"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="is_detail_account"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Cuenta de Detalle</FormLabel>
                      <FormDescription>
                        Marca si es cuenta de último nivel
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allows_movement"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Permite Movimiento</FormLabel>
                      <FormDescription>
                        Permite registrar partidas en esta cuenta
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requires_cost_center"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Requiere Centro de Costo</FormLabel>
                      <FormDescription>
                        Obliga a especificar centro de costo
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Cuenta Activa</FormLabel>
                      <FormDescription>
                        Desactiva para ocultar de operaciones
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">
                {account ? "Guardar Cambios" : "Crear Cuenta"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
