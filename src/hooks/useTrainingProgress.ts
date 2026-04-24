import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const QK = ["training_progress"];

export function useTrainingProgress() {
  const qc = useQueryClient();

  const { data: completedIds = [], isLoading } = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return [];
      const { data, error } = await supabase
        .from("tab_training_progress")
        .select("lesson_id")
        .eq("user_id", userRes.user.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.lesson_id);
    },
  });

  const completedSet = new Set(completedIds);

  const toggle = useMutation({
    mutationFn: async ({ lessonId, completed }: { lessonId: string; completed: boolean }) => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("No autenticado");
      const userId = userRes.user.id;

      if (completed) {
        const { error } = await supabase
          .from("tab_training_progress")
          .insert({ user_id: userId, lesson_id: lessonId });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("tab_training_progress")
          .delete()
          .eq("user_id", userId)
          .eq("lesson_id", lessonId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (err: Error) => {
      toast.error(`No se pudo actualizar el progreso: ${err.message}`);
    },
  });

  return {
    completedSet,
    completedCount: completedIds.length,
    isLoading,
    toggle: (lessonId: string, completed: boolean) => toggle.mutate({ lessonId, completed }),
    isToggling: toggle.isPending,
  };
}
