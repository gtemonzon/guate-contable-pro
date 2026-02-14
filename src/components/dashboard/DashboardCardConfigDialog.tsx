import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CARD_REGISTRY, DEFAULT_VISIBLE_CARDS, type DashboardCardDefinition } from "@/constants/dashboardCards";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TaxConfig } from "@/hooks/useDashboardTaxData";

interface DashboardCardConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: number | null;
  taxConfigs: TaxConfig[];
  currentVisibleCards: string[];
  onSaved: () => void;
}

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  financiero: { label: "Financieros", emoji: "📊" },
  operativo: { label: "Operativos", emoji: "📋" },
  impuestos: { label: "Impuestos", emoji: "🧾" },
};

export function DashboardCardConfigDialog({
  open,
  onOpenChange,
  enterpriseId,
  taxConfigs,
  currentVisibleCards,
  onSaved,
}: DashboardCardConfigDialogProps) {
  const [selected, setSelected] = useState<string[]>(currentVisibleCards);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(currentVisibleCards);
  }, [currentVisibleCards, open]);

  const activeTaxTypes = taxConfigs.map(c => c.tax_form_type);

  const isCardAvailable = (card: DashboardCardDefinition): boolean => {
    if (!card.requiresTaxConfig) return true;
    return activeTaxTypes.includes(card.requiresTaxConfig);
  };

  const toggleCard = (cardId: string) => {
    if (selected.includes(cardId)) {
      setSelected(selected.filter(id => id !== cardId));
    } else {
      if (selected.length >= 8) {
        toast.warning("Máximo 8 tarjetas permitidas");
        return;
      }
      setSelected([...selected, cardId]);
    }
  };

  const handleSave = async () => {
    if (!enterpriseId) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const { error } = await supabase
        .from("tab_dashboard_card_config")
        .upsert({
          enterprise_id: enterpriseId,
          user_id: user.id,
          visible_cards: selected,
          updated_at: new Date().toISOString(),
        }, { onConflict: "enterprise_id,user_id" });

      if (error) throw error;
      toast.success("Configuración guardada");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  const categories = ['financiero', 'operativo', 'impuestos'] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Tarjetas del Dashboard</DialogTitle>
          <DialogDescription>
            Selecciona hasta 8 tarjetas para mostrar en tu dashboard
          </DialogDescription>
        </DialogHeader>

        <div className="text-sm font-medium text-muted-foreground">
          {selected.length}/8 tarjetas seleccionadas
        </div>

        <div className="space-y-4">
          {categories.map((cat) => {
            const cards = CARD_REGISTRY.filter(c => c.category === cat);
            const catInfo = CATEGORY_LABELS[cat];
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span>{catInfo.emoji}</span>
                  <span className="text-sm font-semibold">{catInfo.label}</span>
                </div>
                <div className="space-y-1">
                  {cards.map((card) => {
                    const available = isCardAvailable(card);
                    const checked = selected.includes(card.id);
                    const Icon = card.icon;

                    const content = (
                      <div
                        key={card.id}
                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                          available
                            ? "hover:bg-muted"
                            : "opacity-50 cursor-not-allowed"
                        }`}
                        onClick={() => available && toggleCard(card.id)}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!available}
                          className="pointer-events-none"
                        />
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{card.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{card.description}</p>
                        </div>
                      </div>
                    );

                    if (!available && card.requiresTaxConfig) {
                      return (
                        <TooltipProvider key={card.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>{content}</TooltipTrigger>
                            <TooltipContent>
                              Requiere configuración de {card.requiresTaxConfig}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    }

                    return content;
                  })}
                </div>
                {cat !== 'impuestos' && <Separator className="mt-3" />}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || selected.length === 0}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
