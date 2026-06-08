import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TRAINING_PHASES, TOTAL_LESSONS } from "@/data/trainingContent";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Circle, Loader2, Trophy } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  userId: string;
}

interface ProgressRow {
  lesson_id: string;
  completed_at: string;
}

export default function UserTrainingProgress({ userId }: Props) {
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .from("tab_training_progress")
      .select("lesson_id, completed_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setRows([]);
        } else {
          setRows(data || []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const completedMap = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.lesson_id, r.completed_at));
    return m;
  }, [rows]);

  const completedCount = completedMap.size;
  const overallPct = TOTAL_LESSONS === 0 ? 0 : Math.round((completedCount / TOTAL_LESSONS) * 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Cargando progreso...
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive py-4 text-center">
        No se pudo cargar el progreso: {error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 bg-muted/30">
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
      </div>

      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-4">
          {TRAINING_PHASES.map((phase) => {
            const done = phase.lessons.filter((l) => completedMap.has(l.id)).length;
            const total = phase.lessons.length;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            return (
              <div key={phase.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      Fase {phase.number}: {phase.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{phase.subtitle}</p>
                  </div>
                  <Badge variant={done === total ? "default" : "secondary"} className="text-xs shrink-0">
                    {done}/{total}
                  </Badge>
                </div>
                <Progress value={pct} className="h-1 mb-3" />
                <ul className="space-y-1.5">
                  {phase.lessons.map((lesson) => {
                    const completedAt = completedMap.get(lesson.id);
                    const isDone = !!completedAt;
                    return (
                      <li key={lesson.id} className="flex items-start gap-2 text-sm">
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={isDone ? "font-medium" : "text-muted-foreground"}>
                            {lesson.title}
                          </p>
                          {completedAt && (
                            <p className="text-xs text-muted-foreground">
                              Completada{" "}
                              {format(new Date(completedAt), "d 'de' MMMM yyyy, HH:mm", {
                                locale: es,
                              })}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
