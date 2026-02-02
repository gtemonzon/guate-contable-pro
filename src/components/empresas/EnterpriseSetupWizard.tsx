import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, ChevronRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useEnterpriseSetupStatus, SetupStep } from "@/hooks/useEnterpriseSetupStatus";
import type { Database } from "@/integrations/supabase/types";

type Enterprise = Database['public']['Tables']['tab_enterprises']['Row'];

interface EnterpriseSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterprise: Enterprise | null;
  onOpenEnterpriseDialog: (tab: string) => void;
}

export function EnterpriseSetupWizard({
  open,
  onOpenChange,
  enterprise,
  onOpenEnterpriseDialog,
}: EnterpriseSetupWizardProps) {
  const navigate = useNavigate();
  const { steps, loading, completedCount, totalSteps } = useEnterpriseSetupStatus(
    enterprise?.id ?? null
  );

  const handleStepClick = (step: SetupStep) => {
    onOpenChange(false);

    if (step.dialogTab) {
      // Open the enterprise dialog at the specified tab
      onOpenEnterpriseDialog(step.dialogTab);
    } else if (step.route) {
      // Navigate to the specified route
      navigate(step.route);
    }
  };

  const progressPercentage = (completedCount / totalSteps) * 100;

  // Find the first incomplete step
  const nextStepIndex = steps.findIndex(s => !s.isCompleted);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Asistente de Configuración</DialogTitle>
          <DialogDescription>
            {enterprise?.business_name}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-6">
              {steps.map((step, index) => {
                const isNextStep = index === nextStepIndex;
                
                return (
                  <button
                    key={step.id}
                    onClick={() => handleStepClick(step)}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors",
                      "hover:bg-muted/50",
                      isNextStep && "bg-primary/5 ring-1 ring-primary/20"
                    )}
                  >
                    <div className="mt-0.5">
                      {step.isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <Circle className={cn(
                          "h-5 w-5",
                          isNextStep ? "text-primary" : "text-muted-foreground/50"
                        )} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "font-medium text-sm",
                        step.isCompleted ? "text-foreground" : isNextStep ? "text-primary" : "text-muted-foreground"
                      )}>
                        {index + 1}. {step.label}
                      </div>
                      <div className={cn(
                        "text-xs mt-0.5",
                        step.isCompleted ? "text-muted-foreground" : "text-muted-foreground/70"
                      )}>
                        {step.description}
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      "h-4 w-4 mt-1",
                      step.isCompleted ? "text-muted-foreground" : isNextStep ? "text-primary" : "text-muted-foreground/50"
                    )} />
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progreso</span>
                <span className="font-medium">
                  {completedCount}/{totalSteps} pasos completados
                </span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
