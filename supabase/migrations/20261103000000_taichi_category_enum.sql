-- Nouvelle catégorie : le Taï-chi (reprise du carnet de Livunn, qui l'avait déjà).
-- Seule dans son fichier : une valeur d'enum ajoutée ne peut servir qu'une fois sa transaction validée.
alter type sport.category add value if not exists 'taichi';
