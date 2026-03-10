import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { nit } = await req.json();
    if (!nit || typeof nit !== "string") {
      return new Response(
        JSON.stringify({ error: "NIT es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean NIT: remove spaces and dashes
    const cleaned = nit.replace(/[-\s]/g, "").trim().toUpperCase();

    // Handle CF
    if (cleaned === "CF") {
      return new Response(
        JSON.stringify({ nit: "CF", name: "Consumidor Final", source: "system", found: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate format
    if (!/^\d{1,8}K?$/.test(cleaned)) {
      return new Response(
        JSON.stringify({ error: "Formato de NIT inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Check local cache
    const { data: cached } = await supabase
      .from("taxpayer_cache")
      .select("name, source, last_checked")
      .eq("nit", cleaned)
      .maybeSingle();

    if (cached) {
      return new Response(
        JSON.stringify({
          nit: cleaned,
          name: cached.name,
          source: cached.source,
          found: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Check local purchase/sales ledger as secondary source
    const { data: purchaseMatch } = await supabase
      .from("tab_purchase_ledger")
      .select("supplier_name")
      .eq("supplier_nit", cleaned)
      .not("supplier_name", "eq", "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (purchaseMatch?.supplier_name) {
      // Cache locally
      await supabase.from("taxpayer_cache").upsert({
        nit: cleaned,
        name: purchaseMatch.supplier_name,
        source: "Historial local",
        last_checked: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          nit: cleaned,
          name: purchaseMatch.supplier_name,
          source: "Historial local",
          found: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: salesMatch } = await supabase
      .from("tab_sales_ledger")
      .select("customer_name")
      .eq("customer_nit", cleaned)
      .not("customer_name", "eq", "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (salesMatch?.customer_name) {
      await supabase.from("taxpayer_cache").upsert({
        nit: cleaned,
        name: salesMatch.customer_name,
        source: "Historial local",
        last_checked: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          nit: cleaned,
          name: salesMatch.customer_name,
          source: "Historial local",
          found: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Call SAT FEL registry
    try {
      const satUrl = `https://felgtt.sat.gob.gt/RegistroFEL/registroRecipiente?NIT=${cleaned}`;
      const satResponse = await fetch(satUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });

      if (satResponse.ok) {
        const satData = await satResponse.json();
        const name =
          satData?.nombre ||
          satData?.NOMBRE ||
          satData?.razonSocial ||
          satData?.razon_social ||
          null;

        if (name) {
          // Cache result
          await supabase.from("taxpayer_cache").upsert({
            nit: cleaned,
            name,
            source: "SAT FEL Registry",
            last_checked: new Date().toISOString(),
          });

          return new Response(
            JSON.stringify({ nit: cleaned, name, source: "SAT FEL Registry", found: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    } catch (satError) {
      console.error("SAT FEL lookup failed:", satError);
      // Don't fail – just return not found
    }

    // Step 4: Not found
    return new Response(
      JSON.stringify({ nit: cleaned, found: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("lookup-nit error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
