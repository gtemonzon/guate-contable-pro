import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, CheckCircle2, Circle, ExternalLink, Lightbulb, ChevronRight, Trophy } from "lucide-react";
import { TRAINING_PHASES, TOTAL_LESSONS, type Phase, type Lesson } from "@/data/trainingContent";
import { useTrainingProgress } from "@/hooks/useTrainingProgress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export default function Capacitacion() {
  const { completedSet, completedCount, isLoading, toggle, isToggling } = useTrainingProgress();
  const [activePhaseId, setActivePhaseId] = useState<string>(TRAINING_PHASES[0].id);

  const overallPct = useMemo(
    () => (TOTAL_LESSONS === 0 ? 0 : Math.round((completedCount / TOTAL_LESSONS) * 100)),
    [completedCount]
  );

  const activePhase = TRAINING_PHASES.find((p) => p.id === activePhaseId) ?? TRAINING_PHASES[0];

  const phaseStats = (phase: Phase) => {
    const total = phase.lessons.length;
    const done = phase.lessons.filter((l) => completedSet.has(l.id)).length;
    return { total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
  };

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/10 text-primary">
            <GraduationCap className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Capacitación Interactiva</h1>
            <p className="text-sm text-muted-foreground">
              Aprende a usar el sistema completo en 4 fases progresivas.
            </p>
          </div>
        </div>

        <Card className="md:w-80">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                Progreso global
              </span>
              <span className="text-sm font-bold">
                {completedCount} / {TOTAL_LESSONS}
              </span>
            </div>
            <Progress value={overallPct} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">{overallPct}% completado</p>
          </CardContent>
        </Card>
      </div>

      {/* Selector de fases */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {TRAINING_PHASES.map((phase) => {
          const stats = phaseStats(phase);
          const isActive = phase.id === activePhaseId;
          const isComplete = stats.done === stats.total;
          return (
            <button
              key={phase.id}
              onClick={() => setActivePhaseId(phase.id)}
              className={cn(
                "text-left rounded-lg border p-4 transition-all hover:border-primary/50 hover:shadow-sm",
                isActive ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold",
                    isComplete
                      ? "bg-primary text-primary-foreground"
                      : isActive
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isComplete ? <CheckCircle2 className="h-5 w-5" /> : phase.number}
                </div>
                <Badge variant={isComplete ? "default" : "secondary"} className="text-xs">
                  {stats.done}/{stats.total}
                </Badge>
              </div>
              <h3 className="font-semibold text-sm leading-tight mb-1">{phase.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">{phase.subtitle}</p>
              <Progress value={stats.pct} className="h-1 mt-3" />
            </button>
          );
        })}
      </div>

      {/* Contenido de la fase activa */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
            <span>Fase {activePhase.number}</span>
            <ChevronRight className="h-3 w-3" />
            <span>{phaseStats(activePhase).done} de {activePhase.lessons.length} lecciones</span>
          </div>
          <CardTitle>{activePhase.title}</CardTitle>
          <CardDescription>{activePhase.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {activePhase.lessons.map((lesson) => (
              <LessonItem
                key={lesson.id}
                lesson={lesson}
                completed={completedSet.has(lesson.id)}
                onToggle={(checked) => toggle(lesson.id, checked)}
                disabled={isToggling || isLoading}
              />
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

function LessonItem({
  lesson,
  completed,
  onToggle,
  disabled,
}: {
  lesson: Lesson;
  completed: boolean;
  onToggle: (checked: boolean) => void;
  disabled: boolean;
}) {
  const Icon = lesson.icon;
  return (
    <AccordionItem value={lesson.id}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-3 flex-1 text-left">
          {completed ? (
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
          )}
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className={cn("font-medium", completed && "text-muted-foreground")}>
              {lesson.title}
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              {lesson.description}
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="pl-8 space-y-4">
          <ul className="space-y-2 text-sm text-foreground/90">
            {lesson.content.map((p, i) => (
              <li key={i} className="leading-relaxed flex gap-2">
                <span className="text-primary mt-1">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>

          {lesson.tips && lesson.tips.length > 0 && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-1">
              {lesson.tips.map((tip, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between pt-2 border-t">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox
                checked={completed}
                onCheckedChange={(c) => onToggle(c === true)}
                disabled={disabled}
              />
              <span>Marcar como completada</span>
            </label>
            {lesson.route && (
              <Button asChild size="sm" variant="outline">
                <Link to={lesson.route}>
                  Ir al módulo
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
