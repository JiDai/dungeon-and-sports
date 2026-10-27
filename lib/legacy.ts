// Conversion des anciennes sauvegardes (un état JSON complet par sauvegarde) vers l'export format 2,
// importable par sport.import_player. En comparant les sauvegardes successives, on retrouve les vrais
// événements datés : quêtes validées, pas, récompenses, cagnotte. Ce qui précède la première sauvegarde
// devient un solde d'ouverture, calculé pour que niveau, XP et stats retombent exactement sur le dernier état.
// Extension explicite : ce module est aussi chargé directement par Node (scripts/migrate-to-supabase.mts).
import { CATEGORY_LABELS, CATEGORY_ORDER, REWARD_TIERS } from "./data.ts";
import type { Category, CarnetExport, RewardTierId } from "./types.ts";

/* ---------- Ancien format ---------- */

interface LegacyQuest {
  flavor: string;
  name: string;
  detail: string;
  xp: number;
}

interface LegacyLogEntry {
  date: string;
  text: string;
  xp: number | null;
}

interface LegacyState {
  name: string;
  title: string;
  wishlistCommon: string;
  wishlistRare: string;
  wishlistUltraRare: string;
  wishlistLegendaire: string;
  level: number;
  xp: number;
  stats: Record<Category, number>;
  completedToday: string[];
  activeDraws: Partial<Record<Category, { poolIndex: number; key: string }>>;
  log: LegacyLogEntry[];
  cagnotte: { total: number; entries: { label: string; amount: number; date: string }[] };
  weightLog: { date: string; weight: number }[];
  customPools: Record<Category, LegacyQuest[]> | null;
  pendingLevelUps: number;
}

export interface LegacySnapshot {
  savedAt: number;
  state: unknown;
}

export interface DefaultExercise extends LegacyQuest {
  category: Category;
}

const WISHLIST_KEYS: Record<RewardTierId, keyof LegacyState> = {
  commun: "wishlistCommon",
  rare: "wishlistRare",
  ultrarare: "wishlistUltraRare",
  legendaire: "wishlistLegendaire",
};

/** Reconnaît un état de l'ancien carnet (sauvegarde ou export). */
export function isLegacyState(raw: unknown): boolean {
  const s = raw as { level?: unknown; stats?: unknown } | null;
  return !!s && typeof s === "object" && typeof s.level === "number" && !!s.stats && typeof s.stats === "object";
}

function normalize(raw: unknown): LegacyState {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<LegacyState>;
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const stats = {} as Record<Category, number>;
  for (const c of CATEGORY_ORDER) stats[c] = num(s.stats?.[c]);
  let customPools: LegacyState["customPools"] = null;
  if (s.customPools && typeof s.customPools === "object") {
    customPools = {} as Record<Category, LegacyQuest[]>;
    for (const c of CATEGORY_ORDER) {
      const pool = Array.isArray(s.customPools[c]) ? s.customPools[c] : [];
      customPools[c] = pool
        .filter((q) => q && typeof q.name === "string" && q.name.trim())
        .map((q) => ({
          flavor: String(q.flavor || "Une nouvelle quête").slice(0, 80),
          name: String(q.name).slice(0, 120),
          detail: String(q.detail || "").slice(0, 300),
          xp: Math.min(50, Math.max(1, Math.round(num(q.xp, 15)))),
        }));
    }
  }
  return {
    name: String(s.name || ""),
    title: String(s.title || ""),
    wishlistCommon: String(s.wishlistCommon || ""),
    wishlistRare: String(s.wishlistRare || ""),
    wishlistUltraRare: String(s.wishlistUltraRare || ""),
    wishlistLegendaire: String(s.wishlistLegendaire || ""),
    level: Math.max(1, num(s.level, 1)),
    xp: Math.max(0, num(s.xp)),
    stats,
    completedToday: Array.isArray(s.completedToday) ? s.completedToday.map(String) : [],
    activeDraws: s.activeDraws && typeof s.activeDraws === "object" ? s.activeDraws : {},
    log: Array.isArray(s.log) ? s.log.filter((l) => l && typeof l.text === "string") : [],
    cagnotte: {
      total: num(s.cagnotte?.total),
      entries: Array.isArray(s.cagnotte?.entries) ? s.cagnotte.entries : [],
    },
    weightLog: Array.isArray(s.weightLog) ? s.weightLog.filter((w) => w && typeof w.weight === "number") : [],
    customPools,
    pendingLevelUps: Math.max(0, num(s.pendingLevelUps)),
  };
}

const EMPTY = normalize({});

/* ---------- Reconstruction ---------- */

const totalXp = (s: LegacyState) => 20 * s.level * (s.level - 1) + s.xp;

/** Lignes ajoutées en tête de chronique entre deux sauvegardes (la chronique est limitée à 40 lignes). */
function newLogEntries(prev: LegacyLogEntry[], cur: LegacyLogEntry[]): LegacyLogEntry[] {
  const same = (a: LegacyLogEntry, b: LegacyLogEntry) => a.text === b.text && a.date === b.date && a.xp === b.xp;
  for (let k = 0; k <= cur.length; k++) {
    const rest = cur.slice(k);
    if (rest.length <= prev.length && rest.every((e, i) => same(e, prev[i]))) return cur.slice(0, k);
  }
  return cur;
}

const exerciseKey = (c: Category, q: LegacyQuest) => `${c}\u0000${q.flavor}\u0000${q.name}\u0000${q.detail}\u0000${q.xp}`;

function dayIn(timeZone: string, at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

const iso = (at: number) => new Date(at).toISOString();


/** Date « jj/mm » de l'ancienne chronique (heure locale), avec l'année de la clé, à un an près au Nouvel An. */
function labelDay(key: string, label: string): string | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(label);
  if (!m) return null;
  const keyYear = Number(key.slice(0, 4));
  const keyMonth = Number(key.slice(5, 7));
  const month = Number(m[2]);
  const year = month === 12 && keyMonth === 1 ? keyYear - 1 : month === 1 && keyMonth === 12 ? keyYear + 1 : keyYear;
  const day = `${year}-${m[2]}-${m[1]}`;
  return Number.isNaN(Date.parse(day)) ? null : day;
}

const TIER_BY_LABEL = new Map(REWARD_TIERS.map((t) => [t.label, t.tier]));
const CATEGORY_BY_LABEL = new Map(CATEGORY_ORDER.map((c) => [CATEGORY_LABELS[c], c]));

const RE_LEVEL_UP = /^⚔ Montée de niveau — Niveau \d+$/;
const RE_REWARD = /^(↻ Retirage — )?(?:★ )?(.+) \(([^()]+)\)$/;
const RE_STEPS = /^(?:\(Rattrapage\) )?(\d+) pas(?: — sous le premier palier)?$/;
const RE_CATCH_UP = /^\(Rattrapage\) (.+)$/;
const RE_CAGNOTTE_ADD = /^🪙 Cagnotte \+([\d.]+)(?: — (.*))?$/;
const RE_CAGNOTTE_CASHOUT = /^🏆 Cagnotte encaissée \(([\d.]+)\) — (.*)$/;

export interface LegacyExpected {
  level: number;
  xp: number;
  stats: Record<Category, number>;
  pendingRewards: number;
  cagnotte: number;
}

export interface LegacyConversion {
  data: CarnetExport;
  /** Ce que les vues doivent recalculer après l'import (dernier état de l'ancien carnet). */
  expected: LegacyExpected;
  warnings: string[];
}

/**
 * Convertit des sauvegardes de l'ancien carnet, de la plus ancienne à la plus récente, en export format 2.
 * Une seule sauvegarde (un export collé dans la Fiche) fonctionne aussi : tout vient alors de son contenu.
 */
export function convertLegacy(
  snapshots: LegacySnapshot[],
  defaults: DefaultExercise[],
  timeZone: string,
): LegacyConversion {
  const sorted = [...snapshots].sort((a, b) => a.savedAt - b.savedAt).filter((s) => isLegacyState(s.state));
  if (sorted.length === 0) throw new Error("Aucune sauvegarde de l'ancien carnet");
  const warnings: string[] = [];
  const defaultPools = {} as Record<Category, LegacyQuest[]>;
  for (const c of CATEGORY_ORDER) defaultPools[c] = defaults.filter((d) => d.category === c);
  const poolsOf = (s: LegacyState) => s.customPools ?? defaultPools;

  type Exercise = CarnetExport["exercises"][number];
  type Activity = CarnetExport["activities"][number];
  type Draw = CarnetExport["reward_draws"][number];
  type Entry = CarnetExport["cagnotte_entries"][number];
  type Cashout = CarnetExport["cagnotte_cashouts"][number];

  const exercises = new Map<string, Exercise>();
  const activities: Activity[] = [];
  const rewardDraws: Draw[] = [];
  const entries: Entry[] = [];
  const cashouts: Cashout[] = [];
  const legacyLog: CarnetExport["legacy_log"] = [];
  const weightSeen = new Map<string, number>();
  // Jour affiché par l'ancienne chronique pour chaque rattrapage (voir la dernière passe).
  const shownDay = new Map<Activity, string>();
  const trackPools = (s: LegacyState, at: number) => {
    const present = new Set<string>();
    for (const c of CATEGORY_ORDER) {
      poolsOf(s)[c].forEach((q, i) => {
        const key = exerciseKey(c, q);
        present.add(key);
        const known = exercises.get(key);
        if (!known) {
          exercises.set(key, {
            ref: exercises.size + 1, category: c, flavor: q.flavor, name: q.name, detail: q.detail, xp: q.xp,
            position: i + 1, archived_at: null, created_at: iso(at),
          });
        } else {
          known.position = i + 1;
          known.archived_at = null;
        }
      });
    }
    for (const [key, ex] of exercises) if (!present.has(key) && !ex.archived_at) ex.archived_at = iso(at);
  };

  let prev = EMPTY;
  for (const snap of sorted) {
    const cur = normalize(snap.state);
    const at = snap.savedAt;
    if (!prev.completedToday.every((k) => cur.completedToday.includes(k)) || totalXp(cur) < totalXp(prev)) {
      warnings.push(`Remise à zéro ou import le ${new Date(at).toLocaleString("fr-FR")} : l'historique repart de là.`);
      activities.length = rewardDraws.length = entries.length = cashouts.length = legacyLog.length = 0;
      shownDay.clear();
      prev = EMPTY;
    }

    const prevKeys = new Set(prev.completedToday);
    const newKeys = cur.completedToday.filter((k) => !prevKeys.has(k));
    const takeKey = (suffix: string) => {
      const i = newKeys.findIndex((k) => k.endsWith(`-${suffix}`));
      return i < 0 ? null : newKeys.splice(i, 1)[0];
    };
    const exerciseFor = (text: string): { c: Category; q: LegacyQuest } | null => {
      for (const s of [prev, cur]) {
        for (const c of CATEGORY_ORDER) {
          const q = poolsOf(s)[c].find((x) => `${x.name} — ${x.detail}` === text || x.name === text);
          if (q && newKeys.some((k) => k.endsWith(`-${c}`))) return { c, q };
        }
      }
      return null;
    };

    trackPools(cur, at);

    // Les lignes nouvelles, de la plus ancienne à la plus récente ; une milliseconde d'écart garde leur ordre.
    const fresh = newLogEntries(prev.log, cur.log).reverse();
    fresh.forEach((e, i) => {
      const t = at - (fresh.length - 1 - i);
      const createdAt = iso(t);
      const xp = typeof e.xp === "number" ? e.xp : 0;
      if (RE_LEVEL_UP.test(e.text)) return; // recalculé par la vue chronicle

      const steps = RE_STEPS.exec(e.text);
      if (steps) {
        const key = takeKey("pas");
        if (key) {
          // Le jour de la clé est celui que l'ancien carnet comptait (validation après minuit = la veille).
          const activity: Activity = {
            kind: "steps", day: key.slice(0, 10), category: "vitalite", steps: Number(steps[1]), xp,
            stat_points: xp > 0 ? 1 : 0, late: e.text.startsWith("(Rattrapage)"), created_at: createdAt,
          };
          activities.push(activity);
          const shown = activity.late && labelDay(key, e.date);
          if (shown) shownDay.set(activity, shown);
          return;
        }
      }

      const catchUp = RE_CATCH_UP.exec(e.text);
      const catchUpCat = catchUp ? CATEGORY_BY_LABEL.get(catchUp[1]) : undefined;
      if (catchUpCat) {
        const key = takeKey(catchUpCat);
        if (key) {
          const activity: Activity = {
            kind: "catch_up", day: key.slice(0, 10), category: catchUpCat, xp, stat_points: 1, late: true, created_at: createdAt,
          };
          activities.push(activity);
          const shown = labelDay(key, e.date);
          if (shown) shownDay.set(activity, shown);
          return;
        }
      }

      const quest = exerciseFor(e.text);
      if (quest) {
        const key = takeKey(quest.c)!;
        activities.push({
          kind: "quest", day: key.slice(0, 10), category: quest.c, exercise_ref: exercises.get(exerciseKey(quest.c, quest.q))?.ref ?? null,
          exercise_name: quest.q.name, exercise_detail: quest.q.detail, xp, stat_points: 1, created_at: createdAt,
        });
        return;
      }

      const reward = RE_REWARD.exec(e.text);
      const tier = reward ? TIER_BY_LABEL.get(reward[3]) : undefined;
      if (reward && tier) {
        const day = dayIn(timeZone, t);
        const isReroll = !!reward[1];
        const replaced = isReroll ? rewardDraws.filter((d) => d.day === day).at(-1) : undefined;
        rewardDraws.push({
          ref: rewardDraws.length + 1, day, tier, name: reward[2], description: null, is_reroll: isReroll,
          replaces_ref: replaced?.ref ?? null, created_at: createdAt,
        });
        return;
      }

      const add = RE_CAGNOTTE_ADD.exec(e.text);
      if (add) {
        entries.push({ label: add[2] || "Récompense", amount: Number(add[1]), cashout_ref: null, created_at: createdAt });
        return;
      }
      const cashout = RE_CAGNOTTE_CASHOUT.exec(e.text);
      if (cashout) {
        const ref = cashouts.length + 1;
        const description = cashout[2] === "récompense libre" ? "" : cashout[2];
        cashouts.push({ ref, description, total: Number(cashout[1]), created_at: createdAt });
        for (const entry of entries) if (entry.cashout_ref === null) entry.cashout_ref = ref;
        return;
      }

      legacyLog.push({ date_label: e.date, text: e.text, xp: e.xp, created_at: createdAt });
    });

    for (const w of cur.weightLog) if (!weightSeen.has(w.date)) weightSeen.set(w.date, at);
    prev = cur;
  }

  // Un rattrapage validé juste après minuit avait une clé décalée d'un jour (jours UTC de l'ancien carnet) :
  // on le range au jour qu'affichait la chronique, si aucune autre validation n'occupe ce créneau.
  const slot = (a: Activity, day: string) => `${day}|${a.kind === "steps" ? "pas" : a.category}`;
  const taken = new Set(activities.map((a) => slot(a, a.day)));
  for (const [a, day] of shownDay) {
    if (day === a.day || taken.has(slot(a, day))) continue;
    taken.delete(slot(a, a.day));
    a.day = day;
    taken.add(slot(a, day));
  }

  const last = normalize(sorted.at(-1)!.state);
  const lastAt = sorted.at(-1)!.savedAt;
  const firstAt = Math.min(sorted[0].savedAt, ...activities.map((a) => Date.parse(a.created_at))) - 1000;

  // Solde d'ouverture : ce que l'historique n'explique pas (avant la première sauvegarde).
  const opening: Activity[] = [];
  const knownXp = activities.reduce((n, a) => n + a.xp, 0);
  const openingXp = totalXp(last) - knownXp;
  for (const c of CATEGORY_ORDER) {
    const known = activities.filter((a) => a.category === c).reduce((n, a) => n + (a.stat_points ?? 0), 0);
    const missing = last.stats[c] - known;
    if (missing < 0) warnings.push(`${CATEGORY_LABELS[c]} : l'historique compte ${-missing} point(s) de plus que le dernier état.`);
    if (missing > 0) {
      opening.push({ kind: "opening_balance", day: dayIn(timeZone, firstAt), category: c, xp: 0, stat_points: missing, created_at: iso(firstAt) });
    }
  }
  if (openingXp < 0) warnings.push(`L'historique compte ${-openingXp} XP de plus que le dernier état.`);
  if (openingXp > 0) {
    opening.push({ kind: "opening_balance", day: dayIn(timeZone, firstAt), category: null, xp: openingXp, stat_points: 0, created_at: iso(firstAt) });
  }

  // Cagnotte : si les lignes de chronique ne retombent pas sur le dernier total, on prend les entrées du dernier état.
  const openTotal = entries.filter((e) => e.cashout_ref === null).reduce((n, e) => n + e.amount, 0);
  if (Math.abs(openTotal - last.cagnotte.total) > 0.005) {
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i].cashout_ref === null) entries.splice(i, 1);
    for (const e of [...last.cagnotte.entries].reverse()) {
      if (Number(e.amount) > 0) entries.push({ label: e.label || "Récompense", amount: Number(e.amount), cashout_ref: null, created_at: iso(lastAt) });
    }
  }

  const rewardsDrawn = rewardDraws.filter((d) => !d.is_reroll).length;
  const legacyClaimed = last.level - 1 - last.pendingLevelUps - rewardsDrawn;
  if (legacyClaimed < 0) warnings.push(`${-legacyClaimed} récompense(s) de plus que de montées de niveau.`);

  const finalPools = poolsOf(last);
  const draws: CarnetExport["draws"] = [];
  for (const c of CATEGORY_ORDER) {
    const d = last.activeDraws[c];
    const q = d ? finalPools[c][d.poolIndex] : undefined;
    const ref = q ? exercises.get(exerciseKey(c, q))?.ref : undefined;
    if (d && ref) draws.push({ day: d.key, category: c, exercise_ref: ref, drawn_at: iso(lastAt) });
  }

  const wishlist: CarnetExport["wishlist"] = [];
  for (const t of REWARD_TIERS) {
    String(last[WISHLIST_KEYS[t.tier]])
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((label, i) => wishlist.push({ tier: t.tier, label, position: i + 1 }));
  }

  return {
    data: {
      app: "carnet-de-cendres",
      format: 2,
      exportedAt: iso(Date.now()),
      player: { name: last.name, title: last.title, time_zone: timeZone, legacy_rewards_claimed: Math.max(0, legacyClaimed) },
      exercises: [...exercises.values()],
      draws,
      activities: [...opening, ...activities],
      reward_draws: rewardDraws,
      wishlist,
      cagnotte_cashouts: cashouts,
      cagnotte_entries: entries,
      weights: last.weightLog.map((w) => ({ day: w.date, weight_kg: w.weight, created_at: iso(weightSeen.get(w.date) ?? lastAt) })),
      legacy_log: legacyLog,
    },
    expected: {
      level: last.level,
      xp: last.xp,
      stats: last.stats,
      pendingRewards: last.pendingLevelUps,
      cagnotte: last.cagnotte.total,
    },
    warnings,
  };
}
