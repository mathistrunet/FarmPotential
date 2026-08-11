"""Ajoute la colonne METACODE (code culture 3 lettres) à data/culturi_coduri.csv.

Les codes reprennent EXACTEMENT ceux de la structure « Roumanie » (id 65) dans
data/assolia_cultures_export.csv, en associant le nom de culture ASSOLIA (anglais)
à son metacode interne. Le fichier est lu/écrit en cp1252 (accents) avec fins CRLF.

Idempotent : refuse de tourner si la colonne METACODE existe déjà.
"""
import csv

SRC = "data/culturi_coduri.csv"

# Nom ASSOLIA (anglais) -> metacode, repris de la structure « Roumanie » (id 65).
ROUMANIE = {
    "Soft wheat (winter)": "BTH", "Durum wheat (winter)": "BDH", "Rye": "SGH",
    "Barley (winter)": "ORH", "Barley (spring)": "ORP", "Oat (winter)": "AVH",
    "Oat spring": "AVP", "Grain maize": "MIS", "Sweet maize": "MID", "Sorghum": "SOG",
    "Peas (spring)": "PPR", "Beans (dry)": "PHS", "Lentil": "LEC", "Lupine": "LDH",
    "Chickpea": "PCH", "Sunflower": "TRN", "Rapeseed": "CZH", "Soybean": "SOJ",
    "Hemp (fiber)": "CHV", "Potato": "PTC", "Sugar beet": "BTN", "Alfalfa": "LUZ",
    "Clover": "TRE", "Watermelon and melon": "MLO", "Tomato (field)": "TOM",
    "Cabbage": "CHU", "Eggplant": "PVP", "Bell pepper": "PVP", "Onion": "OIG",
    "Pumpkin": "POT",
}


def main():
    with open(SRC, "r", encoding="cp1252", newline="") as f:
        rows = list(csv.reader(f, delimiter=";"))

    header = rows[0]
    if "METACODE" in header:
        raise SystemExit("METACODE déjà présent — rien à faire.")

    a = header.index("ASSOLIA")
    insert = a + 1  # juste après la colonne ASSOLIA

    out = [header[:insert] + ["METACODE"] + header[insert:]]
    filled = 0
    for r in rows[1:]:
        val = r[a].strip() if len(r) > a else ""
        # Code 3 lettres si la culture existe dans la structure Roumanie ;
        # sinon on conserve le texte ASSOLIA tel quel (ex. « Arable other crop »)
        # pour qu'il se retrouve dans le CSV exporté. Vide seulement si ASSOLIA est vide.
        code = ROUMANIE.get(val, val)
        if code:
            filled += 1
        out.append(r[:insert] + [code] + r[insert:])

    with open(SRC, "w", encoding="cp1252", newline="") as f:
        csv.writer(f, delimiter=";", lineterminator="\r\n",
                   quoting=csv.QUOTE_MINIMAL).writerows(out)

    print(f"OK — {len(out) - 1} lignes, {filled} metacodes renseignés.")


if __name__ == "__main__":
    main()
