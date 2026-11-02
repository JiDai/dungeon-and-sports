-- Nouvelle sorte d'activité : un exercice choisi librement (hors quête du jour).
-- Seule dans son fichier : une valeur d'enum ajoutée ne peut servir qu'une fois sa transaction validée.
alter type sport.activity_kind add value if not exists 'exercise';
