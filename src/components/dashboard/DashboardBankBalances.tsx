import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Landmark } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchAllRecords } from "@/utils/supabaseHelpers";

interface DashboardBankBalancesProps {
  enterpriseId: number | null;
}

const formatNumber = (num: number): string =>
  num.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DashboardBankBalances({ enterpriseId }: DashboardBankBalancesProps) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-bank-balances", enterpriseId],
    queryFn: async () => {
      if (!enterpriseId) return [];

      // Get bank accounts for this enterprise
      const { data: bankAccounts } = await supabase
        .from("tab_bank_accounts")
        .select("id, bank_name, account_number, account_id")
        .eq("enterprise_id", enterpriseId)
        .eq("is_active", true);

      if (!bankAccounts || bankAccounts.length === 0) return [];

      // For each bank account with a linked accounting account, calculate balance
      const results = await Promise.all(
        bankAccounts.map(async (ba) => {
          let balance = 0;

          if (ba.account_id) {
            const movQuery = supabase
              .from("tab_journal_entry_details")
              .select(`
                debit_amount,
                credit_amount,
                tab_journal_entries!inner(enterprise_id)
              `)
              .eq("tab_journal_entries.enterprise_id", enterpriseId)
              .eq("account_id", ba.account_id);

            const movements = await fetchAllRecords<any>(movQuery);
            balance = movements.reduce(
              (sum, m) => sum + Number(m.debit_amount || 0) - Number(m.credit_amount || 0),
              0
            );
          }

          return {
            id: ba.id,
            bankName: ba.bank_name,
            accountNumber: ba.account_number.slice(-4),
            balance,
          };
        })
      );

      return results;
    },
    enabled: !!enterpriseId,
    refetchInterval: 5 * 60 * 1000,
  });

  const totalBalance = (data || []).reduce((s, a) => s + a.balance, 0);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/conciliacion")}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Saldos Bancarios</CardTitle>
        <Landmark className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-3/4 mb-2" />
            <Skeleton className="h-4 w-full" />
          </>
        ) : data && data.length > 0 ? (
          <>
            <div className="text-2xl font-bold financial-number">
              Q {formatNumber(totalBalance)}
            </div>
            <div className="mt-2 space-y-1.5">
              {data.slice(0, 4).map((account) => (
                <div key={account.id} className="flex justify-between text-xs">
                  <span className="text-muted-foreground truncate mr-2">
                    {account.bankName} ****{account.accountNumber}
                  </span>
                  <span className={`font-semibold financial-number ${account.balance >= 0 ? "" : "text-destructive"}`}>
                    Q {formatNumber(account.balance)}
                  </span>
                </div>
              ))}
              {data.length > 4 && (
                <p className="text-xs text-muted-foreground">+{data.length - 4} más</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground mt-1">Sin cuentas bancarias</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
