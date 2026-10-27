// Rattache le carnet local (joueur sans compte) à un compte Supabase Auth, créé au besoin.
//
//   node --env-file=.env.local scripts/link-player.mts <e-mail>
//
// La connexion n'accepte que les comptes existants : ce script est la seule façon d'en créer un.
// Si le compte a déjà un joueur vide (connexion avant le rattachement), il est supprimé ; s'il a de la
// progression, le script s'arrête sans rien toucher.

import { createClient } from "@supabase/supabase-js";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Usage : pnpm link-player <e-mail>");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL et SUPABASE_SECRET_KEY doivent être définis (voir .env.example)");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, key, options).auth.admin;
  const sport = createClient(url, key, { ...options, db: { schema: "sport" } });

  // 1. Le compte.
  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Auth : ${error.message}`);
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    const { data, error } = await admin.createUser({ email, email_confirm: true });
    if (error) throw new Error(`Création du compte : ${error.message}`);
    userId = data.user.id;
    console.log(`Compte créé pour ${email}.`);
  } else {
    console.log(`Compte existant pour ${email}.`);
  }

  // 2. Le joueur local à rattacher.
  const { data: players, error } = await sport.from("player").select("id, name, auth_user_id").order("created_at");
  if (error) throw new Error(`Supabase (player) : ${error.message}`);
  if (players.some((p) => p.auth_user_id === userId) && !players.some((p) => p.auth_user_id === null)) {
    console.log("Ce compte a déjà son carnet : rien à faire.");
    return;
  }
  const local = players.find((p) => p.auth_user_id === null);
  if (!local) throw new Error("Aucun carnet sans compte à rattacher.");

  // 3. Un joueur vide créé par une connexion antérieure laisse la place.
  const existing = players.find((p) => p.auth_user_id === userId);
  if (existing) {
    const { count, error: countError } = await sport
      .from("activity")
      .select("id", { count: "exact", head: true })
      .eq("player_id", existing.id);
    if (countError) throw new Error(`Supabase (activity) : ${countError.message}`);
    if (count) throw new Error("Ce compte a déjà un carnet avec de la progression : rattachement annulé.");
    const { error: deleteError } = await sport.from("player").delete().eq("id", existing.id);
    if (deleteError) throw new Error(`Supabase (player) : ${deleteError.message}`);
    console.log("Carnet vide du compte supprimé.");
  }

  const { error: linkError } = await sport.from("player").update({ auth_user_id: userId }).eq("id", local.id);
  if (linkError) throw new Error(`Supabase (player) : ${linkError.message}`);
  console.log(`Carnet « ${local.name || "sans nom"} » rattaché à ${email}.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
