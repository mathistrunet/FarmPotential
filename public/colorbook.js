// --- Couleurs par culture (logiques, sans noir). À coller APRÈS window.CODEBOOK_EXTRA ---
window.CULTURE_COLORS = {
  // CÉRÉALES (jaunes/dorés)
  AVH:"#D2B55B", 
  AVP:"#D9BF6A",
  BDH:"#A88616", 
  BDP:"#B9921F",
  BTH:"#C9A227", 
  BTP:"#D1AE39",
  EPE:"#CFB16A",
  ORH:"#B59A4C", 
  ORP:"#C2A450",
  RIZ:"#7BAFDE",
  SRS:"#C08A54",
  SGH:"#A8923A", 
  SGP:"#B79C42",
  SOG:"#A5692B",
  TTH:"#C8B06D", 
  TTP:"#CFB877",
  CAG:"#D4C06A", 
  CAH:"#CDB760",
  MCS:"#D2B86A", 
  MCR:"#CBB062",

  // OLÉAGINEUX (jaunes/orangés)
  CML:"#E6C75B",
  CZH:"#F1D21A", 
  CZP:"#F3DE4F",
  LIH:"#E3D269", 
  LIP:"#E8D97A",
  MOT:"#F0C419",
  OEI:"#8E7CC3",   // œillette (pavot) : violet doux
  TRN:"#F2B705",
  OAG:"#E6C75B", 
  OHR:"#E2C146",

  // LÉGUMINEUSES & FOURRAGÈRES (verts/bleutés)
  ARA:"#2E7D32",
  FEV:"#2F8F5B", 
  FNU:"#2F9D6A",
  FVL:"#318E63", 
  FVP:"#35A06C",
  GES:"#2FBF91",
  LEC:"#3DBB73",
  LDH:"#2C8F5A", 
  LDP:"#31A56B",
  LOT:"#3AA76D",
  PCH:"#2FAE6E",
  PHI:"#2A6F3A", 
  PPR:"#2FBF71",
  PHS:"#2FAE6E", 
  PHF:"#36B77A",
  LUZ:"#1F7A46", 
  SAI:"#2E8B57",
  SOJ:"#2E7D32", 
  TRE:"#4CAF50",
  VES:"#2FBF91",
  PAG:"#2FAE6E",
  MLF:"#2F9D6A", 
  MPC:"#2F9D6A", 
  MLC:"#2F9D6A",
  CPL:"#9DCB6B",
  CID:"#7CB342", 
  CIT:"#7CB342",

  // DIVERSIFIÉ / DOM
  MDI:"#9C27B0",  // maraîchage diversifié
  SHD:"#90A4AE",

  // PRAIRIES / PÂTURAGES (verts foncés)
  MLG:"#2B7D4A", 
  PTR:"#2E8B57", 
  GRA:"#2C7A43",
  PPH:"#176A3A", 
  SPH:"#1E6E3F", 
  SPL:"#226C3D",

  // BOIS/CHÊNAIES/CHÂTAIGNERAIES (bruns/olives)
  CAE:"#8D6E63", 
  CEE:"#795548",

  // INDUSTRIELLES / RACINES / FIBRES
  BTN:"#7CB342", 
  CHV:"#3B7E3B",
  CSA:"#9E9D24",
  HBL:"#6AA84F",
  LIF:"#5DADE2",
  PTC:"#A35D2A",
  TAB:"#8D6E63",

  // LÉGUMES & FRUITS ANNUELS (couleurs “nature”)
  AIL:"#C0AA6E",
  ANA:"#F2A65A",
  ART:"#6AA84F",
  BEF:"#E5D067", 
  BCA:"#DCCB5A",
  CAR:"#F28F3B",
  CEL:"#8BC34A",
  CHU:"#9CCC65",
  CCN:"#4CAF50",
  EPI:"#388E3C",
  FRA:"#D1495B",
  LBF:"#7FB069",
  MLO:"#F2A65A",
  NVT:"#D7B49E",
  OIG:"#C0AA6E",
  RDI:"#E57373",
  POR:"#5E8D5A",
  PVP:"#B85C6B",
  POT:"#E0913D",
  TOM:"#D1495B",
  TBT:"#C77800",
  FLA:"#F2A65A",
  FLP:"#D79F43",

  // VERGERS / VIGNE (orangés/bordeaux/olive)
  AGR:"#F5B041",
  CAC:"#6D4C41",
  CBT:"#C2185B",
  CTG:"#8D6E63",
  NOS:"#8D6E63",
  NOX:"#795548",
  OLI:"#556B2F",
  PVT:"#F39C12",
  PWT:"#D4AC0D",
  PRU:"#8E44AD",
  VRG:"#D79F43",
  PFR:"#C9785D",
  PPP:"#8E7CC3",
  VRC:"#8E3B46",

  // AROMATIQUES / PARFUM / MÉDICINALES
  ARP:"#81C784",
  VNL:"#B5651D",
  AAR:"#81C784",
  PSL:"#43A047",
  PRF:"#9575CD",
  LAV:"#8E7CC3",
  AME:"#AED581",
  PME:"#9CCC65",
  HPC:"#8A2BE2",

  // AUTRES / SURFACES SPÉCIALES
  AFG:"#9E9D24",
  JNO:"#9E9E9E",
  MSW:"#607D8B",
  ACP:"#D7CCC8",
  PEP:"#78909C", 
  PEV:"#90A4AE",
  TRU:"#5D4037",
  TCR:"#795548",
  SBO:"#4E342E",
  BOR:"#A1887F",
  BTA:"#BCAAA4",
  BFS:"#A1887F",
  CSS:"#B0BEC5",
  MRS:"#90A4AE",
  SAG:"#9CCC65",
  SNU:"#A1887F",
  SNE:"#BDBDBD",
  SIN:"#CFD8DC",

  // CODES "D*" (couverts / fourragers / CIPAN)
  DVN:"#D2B55B",     // avoine
  DBM:"#2C7A43",     // brôme (graminée)
  DBR:"#5DADE2",     // bourrache (fleurs bleues)
  DCF:"#8BC34A",     // chou fourrager
  DCM:"#E6C75B",     // cameline
  DCR:"#4CAF50",     // cresson alénois
  DCZ:"#F1D21A",     // colza
  DDC:"#2C7A43",     // dactyle (graminée)
  DFL:"#2C7A43",     // fléole
  DFN:"#2F9D6A",     // fenugrec
  DFV:"#35A06C",     // féverole
  DGS:"#2FBF91",     // gesse
  DLL:"#3DBB73",     // lentille
  DLN:"#5DADE2",     // lin
  DLT:"#3AA76D",     // lotier
  DLP:"#31A56B",     // lupin
  DLZ:"#1F7A46",     // luzerne
  DMD:"#F0C419",     // moutarde
  DMH:"#CDB760",     // moha
  DML:"#D4C06A",     // millet
  DMN:"#2F9D6A",     // minette
  DMT:"#2FBF91",     // mélilot
  DNG:"#8D6E63",     // nyger
  DNT:"#E6C75B",     // navette
  DNV:"#D7B49E",     // navet
  DPC:"#2FAE6E",     // pois chiche
  DPH:"#9575CD",     // phacélie (violet)
  DPS:"#2FAE6E",     // pois
  DPT:"#2C7A43",     // pâturin commun
  DRD:"#E57373",     // radis fourrager
  DRG:"#2C7A43",     // ray-grass
  DRQ:"#8BC34A",     // roquette
  DSD:"#2FBF91",     // serradelle
  DSF:"#A5692B",     // sorgho fourrager
  DSG:"#A8923A",     // seigle
  DSH:"#7CB342",     // sous-semis herbe/légumineuses
  DSJ:"#2E7D32",     // soja
  DSN:"#2E8B57",     // sainfoin
  DSR:"#C08A54",     // sarrasin
  DTN:"#F2B705",     // tournesol
  DTR:"#4CAF50",     // trèfle
  DVS:"#2FBF91",     // vesce
  DXF:"#2C7A43"      // x-festulolium (graminée)
};

// Couleur de repli si un code n'est pas listé
window.DEFAULT_CULTURE_COLOR = "#CCCCCC";
