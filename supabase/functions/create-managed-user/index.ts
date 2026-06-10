import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type RequestBody = {
  email?: string;
  password?: string;
  full_name?: string;
  tenant_id?: number;
  is_tenant_admin?: boolean;
  is_active?: boolean;
  enterprise_roles?: Array<{
    enterprise_id: number;
    role: string;
  }>;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "No autorizado" }, 401);
    }

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse({ error: "No autorizado" }, 401);
    }

    const { data: currentUser, error: currentUserError } = await client
      .from("tab_users")
      .select("id, tenant_id, is_super_admin, is_tenant_admin")
      .eq("id", authData.user.id)
      .single();

    if (currentUserError || !currentUser) {
      return jsonResponse({ error: "No se pudo validar el usuario actual" }, 403);
    }

    if (!currentUser.is_super_admin && !currentUser.is_tenant_admin) {
      return jsonResponse({ error: "Sin permisos para crear usuarios" }, 403);
    }

    const body = (await req.json()) as RequestBody;
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const fullName = body.full_name?.trim();
    const requestedTenantId = Number(body.tenant_id);
    const isTenantAdmin = Boolean(body.is_tenant_admin);
    const isActive = body.is_active ?? true;
    const requestedEnterpriseRoles = Array.isArray(body.enterprise_roles) ? body.enterprise_roles : [];

    if (!email || !password || !fullName) {
      return jsonResponse({ error: "Email, nombre y contraseña son obligatorios" }, 400);
    }

    if (!Number.isFinite(requestedTenantId)) {
      return jsonResponse({ error: "La oficina contable es obligatoria" }, 400);
    }

    if (!currentUser.is_super_admin && currentUser.tenant_id !== requestedTenantId) {
      return jsonResponse({ error: "Solo puedes crear usuarios dentro de tu oficina contable" }, 403);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { data: tenant, error: tenantError } = await adminClient
      .from("tab_tenants")
      .select("id")
      .eq("id", requestedTenantId)
      .eq("is_active", true)
      .maybeSingle();

    if (tenantError || !tenant) {
      return jsonResponse({ error: "La oficina contable seleccionada no es válida" }, 400);
    }

    const { data: tenantEnterprises, error: enterprisesError } = await adminClient
      .from("tab_enterprises")
      .select("id")
      .eq("tenant_id", requestedTenantId)
      .eq("is_active", true);

    if (enterprisesError) {
      return jsonResponse({ error: "No se pudieron validar las empresas asignadas" }, 400);
    }

    const validEnterpriseIds = new Set((tenantEnterprises || []).map((item) => item.id));

    // Role allowlist:
    // - Tenant admins can assign enterprise_admin + base roles within their own tenant.
    // - Only super admins can assign super_admin.
    const BASE_ALLOWED_ROLES = new Set(["contador_senior", "auxiliar_contable", "cliente"]);
    const TENANT_ADMIN_ROLES = new Set(["enterprise_admin"]);
    const SUPER_ADMIN_ONLY_ROLES = new Set(["super_admin"]);
    const callerIsSuperAdmin = !!currentUser.is_super_admin;
    const callerIsTenantAdmin = !!currentUser.is_tenant_admin;

    const isRoleAllowed = (role: string) => {
      if (BASE_ALLOWED_ROLES.has(role)) return true;
      if ((callerIsSuperAdmin || callerIsTenantAdmin) && TENANT_ADMIN_ROLES.has(role)) return true;
      if (callerIsSuperAdmin && SUPER_ADMIN_ONLY_ROLES.has(role)) return true;
      return false;
    };


    const enterpriseRoles = isTenantAdmin
      ? Array.from(validEnterpriseIds).map((enterpriseId) => ({
          enterprise_id: enterpriseId,
          role: "enterprise_admin",
        }))
      : requestedEnterpriseRoles.filter((item, index, array) => {
          if (!item?.enterprise_id || !item.role) return false;
          if (!isRoleAllowed(item.role)) return false;
          return array.findIndex((candidate) => candidate.enterprise_id === item.enterprise_id) === index;
        });

    // If the caller is not a super admin, they cannot create tenant admins (which auto-assigns enterprise_admin).
    if (isTenantAdmin && !callerIsSuperAdmin) {
      return jsonResponse({ error: "Solo un super administrador puede crear administradores de oficina contable" }, 403);
    }

    if (!isTenantAdmin && requestedEnterpriseRoles.length > 0 && enterpriseRoles.length !== requestedEnterpriseRoles.length) {
      return jsonResponse({ error: "Se solicitó un rol no permitido para este usuario" }, 400);
    }

    if (enterpriseRoles.length > 0) {
      const invalidAssignment = enterpriseRoles.find((item) => !validEnterpriseIds.has(item.enterprise_id));
      if (invalidAssignment) {
        return jsonResponse({ error: "Hay empresas asignadas que no pertenecen a la oficina contable seleccionada" }, 400);
      }
    }

    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        tenant_id: requestedTenantId,
        is_tenant_admin: isTenantAdmin,
        is_active: isActive,
      },
    });

    if (createError || !createdUser.user) {
      console.error("Error creating auth user:", createError);
      return jsonResponse({ error: createError?.message || "No se pudo crear el usuario" }, 400);
    }

    const userId = createdUser.user.id;

    const { error: profileUpdateError } = await adminClient
      .from("tab_users")
      .update({
        is_active: isActive,
        is_tenant_admin: isTenantAdmin,
        tenant_id: requestedTenantId,
      })
      .eq("id", userId);

    if (profileUpdateError) {
      console.error("Error updating tab_users:", profileUpdateError);
      await adminClient.auth.admin.deleteUser(userId);
      return jsonResponse({ error: "No se pudo completar el perfil del usuario" }, 400);
    }

    if (enterpriseRoles.length > 0) {
      const enterpriseRows = enterpriseRoles.map((item) => ({
        user_id: userId,
        enterprise_id: item.enterprise_id,
        role: item.role,
      }));

      const { error: relationsError } = await adminClient
        .from("tab_user_enterprises")
        .insert(enterpriseRows);

      if (relationsError) {
        console.error("Error inserting tab_user_enterprises:", relationsError);
        await adminClient.auth.admin.deleteUser(userId);
        return jsonResponse({ error: "No se pudieron guardar las empresas asignadas" }, 400);
      }

      const roleRows = enterpriseRoles.map((item) => ({
        user_id: userId,
        enterprise_id: item.enterprise_id,
        role: item.role,
      }));

      const { error: rolesError } = await adminClient
        .from("user_roles")
        .insert(roleRows);

      if (rolesError) {
        console.error("Error inserting user_roles:", rolesError);
        await adminClient.from("tab_user_enterprises").delete().eq("user_id", userId);
        await adminClient.auth.admin.deleteUser(userId);
        return jsonResponse({ error: "No se pudieron guardar los roles del usuario" }, 400);
      }
    }

    return jsonResponse({ user_id: userId, message: "Usuario creado correctamente" });
  } catch (error) {
    console.error("create-managed-user error:", error);
    const message = error instanceof Error ? error.message : "Error interno al crear usuario";
    return jsonResponse({ error: message }, 500);
  }
});