/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type BookType =
  | 'libro_compras'
  | 'libro_ventas'
  | 'libro_diario'
  | 'libro_mayor'
  | 'libro_estados_financieros';

export const BOOK_TYPE_LABELS: Record<BookType, string> = {
  libro_compras: 'Libro de Compras',
  libro_ventas: 'Libro de Ventas',
  libro_diario: 'Libro Diario',
  libro_mayor: 'Libro Mayor',
  libro_estados_financieros: 'Libro de Estados Financieros',
};

export interface BookAuthorization {
  id: number;
  enterprise_id: number;
  book_type: BookType;
  authorization_number: string;
  authorization_date: string;
  authorized_folios: number;
  manual_adjustment: number;
  notes: string | null;
  is_active: boolean;
  low_folios_notified_at: string | null;
  depleted_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FolioStatus {
  authorized: number;
  used: number;
  adjustment: number;
  available: number;
  is_low: boolean;
  is_overdrawn: boolean;
}

export interface FolioConsumption {
  id: number;
  authorization_id: number;
  enterprise_id: number;
  book_type: string;
  pages_used: number;
  report_period: string | null;
  report_date_from: string | null;
  report_date_to: string | null;
  notes: string | null;
  created_at: string;
}

export function useBookAuthorizations(enterpriseId?: number | null) {
  const [authorizations, setAuthorizations] = useState<BookAuthorization[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!enterpriseId) {
      setAuthorizations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('tab_book_authorizations' as any)
      .select('*')
      .eq('enterprise_id', enterpriseId)
      .order('book_type')
      .order('authorization_date', { ascending: true });
    if (!error && data) {
      setAuthorizations(data as unknown as BookAuthorization[]);
    }
    setLoading(false);
  }, [enterpriseId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const create = async (input: Omit<BookAuthorization, 'id' | 'created_at' | 'updated_at' | 'manual_adjustment' | 'low_folios_notified_at' | 'depleted_notified_at' | 'is_active'> & { is_active?: boolean }) => {
    const { error } = await supabase.from('tab_book_authorizations' as any).insert({
      ...input,
      is_active: input.is_active ?? true,
    } as any);
    if (error) throw error;
    // Limpiar notificaciones obsoletas para ese libro
    await supabase
      .from('tab_notifications')
      .delete()
      .eq('enterprise_id', input.enterprise_id)
      .in('notification_type', [
        `folios_bajos_${input.book_type}`,
        `folios_agotados_${input.book_type}`,
      ]);
    await fetchAll();
  };

  const update = async (id: number, patch: Partial<BookAuthorization>) => {
    const { error } = await supabase
      .from('tab_book_authorizations' as any)
      .update(patch as any)
      .eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const remove = async (id: number) => {
    const { error } = await supabase.from('tab_book_authorizations' as any).delete().eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const getFolioStatus = async (authorizationId: number): Promise<FolioStatus | null> => {
    const { data, error } = await supabase.rpc('get_authorization_folio_status' as any, {
      _authorization_id: authorizationId,
    });
    if (error || !data || (data as any[]).length === 0) return null;
    return (data as any[])[0] as FolioStatus;
  };

  const getActiveAuthorizationForBook = async (
    entId: number,
    bookType: BookType
  ): Promise<{ auth: BookAuthorization; status: FolioStatus } | null> => {
    const { data, error } = await supabase
      .from('tab_book_authorizations' as any)
      .select('*')
      .eq('enterprise_id', entId)
      .eq('book_type', bookType)
      .eq('is_active', true)
      .order('authorization_date', { ascending: true });
    if (error || !data) return null;

    for (const auth of data as unknown as BookAuthorization[]) {
      const status = await getFolioStatus(auth.id);
      if (status && status.available > 0) {
        return { auth, status };
      }
    }
    // Si todas están agotadas, devolver la última (la más reciente) para mostrar advertencia
    const list = data as unknown as BookAuthorization[];
    if (list.length > 0) {
      const last = list[list.length - 1];
      const status = await getFolioStatus(last.id);
      if (status) return { auth: last, status };
    }
    return null;
  };

  const consumePages = async (
    authorizationId: number,
    pagesUsed: number,
    metadata: {
      enterpriseId: number;
      bookType: BookType;
      reportPeriod?: string;
      dateFrom?: string;
      dateTo?: string;
      notes?: string;
    }
  ) => {
    if (!pagesUsed || pagesUsed <= 0) return;

    await supabase.from('tab_book_folio_consumption' as any).insert({
      authorization_id: authorizationId,
      enterprise_id: metadata.enterpriseId,
      book_type: metadata.bookType,
      pages_used: pagesUsed,
      report_period: metadata.reportPeriod ?? null,
      report_date_from: metadata.dateFrom ?? null,
      report_date_to: metadata.dateTo ?? null,
      notes: metadata.notes ?? null,
    } as any);

    // Re-evaluar y notificar si corresponde
    const status = await getFolioStatus(authorizationId);
    if (!status) return;
    const { data: authData } = await supabase
      .from('tab_book_authorizations' as any)
      .select('*')
      .eq('id', authorizationId)
      .maybeSingle();
    const auth = authData as unknown as BookAuthorization | null;
    if (!auth) return;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const bookLabel = BOOK_TYPE_LABELS[metadata.bookType];

    if (status.is_overdrawn) {
      const last = auth.depleted_notified_at ? new Date(auth.depleted_notified_at) : null;
      if (!last || last < sevenDaysAgo) {
        await supabase.from('tab_notifications').insert({
          enterprise_id: metadata.enterpriseId,
          notification_type: `folios_agotados_${metadata.bookType}`,
          title: `Folios agotados — ${bookLabel}`,
          description: `La autorización ${auth.authorization_number} está sobregirada en ${Math.abs(status.available)} folios. Se recomienda no continuar emitiendo libros hasta autorizar nuevos folios.`,
          priority: 'urgente',
          action_url: '/empresas',
        });
        await supabase
          .from('tab_book_authorizations' as any)
          .update({ depleted_notified_at: new Date().toISOString() } as any)
          .eq('id', authorizationId);
      }
    } else if (status.is_low) {
      const last = auth.low_folios_notified_at ? new Date(auth.low_folios_notified_at) : null;
      if (!last || last < sevenDaysAgo) {
        await supabase.from('tab_notifications').insert({
          enterprise_id: metadata.enterpriseId,
          notification_type: `folios_bajos_${metadata.bookType}`,
          title: `Folios por agotarse — ${bookLabel}`,
          description: `Quedan ${status.available} folios disponibles de la autorización ${auth.authorization_number}. Solicita una nueva autorización a SAT.`,
          priority: 'importante',
          action_url: '/empresas',
        });
        await supabase
          .from('tab_book_authorizations' as any)
          .update({ low_folios_notified_at: new Date().toISOString() } as any)
          .eq('id', authorizationId);
      }
    }

    await fetchAll();
  };

  const adjustAvailable = async (
    authorizationId: number,
    desiredAvailable: number,
    note: string
  ) => {
    const status = await getFolioStatus(authorizationId);
    if (!status) return;
    // available = authorized - used; queremos newAvailable
    // newUsed = authorized - newAvailable; delta_adjustment = newUsed - currentUsed
    const newUsed = status.authorized - desiredAvailable;
    const delta = newUsed - status.used;
    const { data: authData } = await supabase
      .from('tab_book_authorizations' as any)
      .select('manual_adjustment')
      .eq('id', authorizationId)
      .maybeSingle();
    const currentAdjustment = (authData as any)?.manual_adjustment ?? 0;
    await supabase
      .from('tab_book_authorizations' as any)
      .update({ manual_adjustment: currentAdjustment + delta } as any)
      .eq('id', authorizationId);
    // Registrar trazabilidad como consumo informativo (positivo o negativo)
    if (delta !== 0) {
      const { data: full } = await supabase
        .from('tab_book_authorizations' as any)
        .select('enterprise_id, book_type')
        .eq('id', authorizationId)
        .maybeSingle();
      const fullAuth = full as any;
      if (fullAuth) {
        await supabase.from('tab_book_folio_consumption' as any).insert({
          authorization_id: authorizationId,
          enterprise_id: fullAuth.enterprise_id,
          book_type: fullAuth.book_type,
          pages_used: delta,
          notes: `Ajuste manual: ${note}`,
        } as any);
      }
    }
    await fetchAll();
  };

  return {
    authorizations,
    loading,
    refetch: fetchAll,
    create,
    update,
    remove,
    getFolioStatus,
    getActiveAuthorizationForBook,
    consumePages,
    adjustAvailable,
  };
}
