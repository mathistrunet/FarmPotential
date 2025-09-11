// Champs possibles dans les livrables RRP (les noms varient parfois)
export const FIELD_UCS = ["UCS", "Code_UCS", "code_ucs", "ucs"];
export const FIELD_TEXTURE = ["TEXTURE", "Texture", "texture", "TEX", "tex"];
export const FIELD_PROF = ["PROFONDEUR", "Profondeur", "profondeur", "PROF", "prof"];
export const FIELD_LIB = ["LIBELLE", "Libelle", "libelle", "LIB", "lib", "NOM", "Nom", "nom"];

// Carte de couleurs par texture (adapte à ta charte)
// Si tu préfères par UCS, fais un mapping UCS -> couleur.
export const TEXTURE_COLORS: Record<string, string> = {
  "sableux": "#f2d16b",
  "limoneux": "#c9d8ff",
  "argilo-limoneux": "#c1b5ff",
  "limono-argileux": "#9db0ff",
  "argileux": "#8466ff",
  "caillouteux": "#c7b199",
};

// Couleur par défaut si on ne matche rien
export const DEFAULT_FILL = "#4aa84a";
export const DEFAULT_OUTLINE = "#2d6c2d";
export const DEFAULT_FILL_OPACITY = 0.35;
