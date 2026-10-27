"use client";

import type { ComponentType } from "react";
import { CarnetProvider, useCarnet } from "./CarnetProvider";
import { ChroniqueTab } from "./tabs/ChroniqueTab";
import { CompetencesTab } from "./tabs/CompetencesTab";
import { ExercicesTab } from "./tabs/ExercicesTab";
import { FicheTab } from "./tabs/FicheTab";
import { QuetesTab } from "./tabs/QuetesTab";
import { RecompensesTab } from "./tabs/RecompensesTab";
import { SuiviTab } from "./tabs/SuiviTab";
import { TABS } from "@/lib/data";
import type { TabId } from "@/lib/types";

const TAB_COMPONENTS: Record<TabId, ComponentType> = {
  fiche: FicheTab,
  competences: CompetencesTab,
  exercices: ExercicesTab,
  quetes: QuetesTab,
  suivi: SuiviTab,
  recompenses: RecompensesTab,
  chronique: ChroniqueTab,
};

function App() {
  const { activeTab, setActiveTab, error } = useCarnet();
  return (
    <div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={`tab-btn${activeTab === t.id ? " active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="feedback" role="alert">
          ⚠ {error}
        </div>
      )}
      {/* Tous les onglets restent montés pour conserver leurs saisies et messages. */}
      {TABS.map(({ id }) => {
        const Tab = TAB_COMPONENTS[id];
        return (
          <div key={id} role="tabpanel" className={`tab-content${activeTab === id ? " active" : ""}`}>
            <Tab />
          </div>
        );
      })}

      <p className="disclaimer">
        Les exercices proposés sont des exemples génériques, à adapter à ta condition physique. En cas de douleur, de
        blessure ou de doute, demande l&apos;avis d&apos;un professionnel de santé.
      </p>
    </div>
  );
}

export function Carnet() {
  return (
    <CarnetProvider>
      <App />
    </CarnetProvider>
  );
}
