import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  isShapefilePart,
  buildShapefileZipBufferFromFiles,
} from "../services/romaniaShapefileZip";

/** Crée un faux File (suffisant pour le code testé : name, webkitRelativePath, arrayBuffer). */
function fakeFile(relPath: string, content = "x") {
  const name = relPath.split(/[\\/]/).pop() as string;
  const buf = new TextEncoder().encode(content).buffer;
  return { name, webkitRelativePath: relPath, arrayBuffer: async () => buf } as unknown as File;
}

async function entriesOf(buffer: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  return Object.values(zip.files)
    .filter((f) => !f.dir)
    .map((f) => f.name)
    .sort();
}

describe("isShapefilePart", () => {
  it("reconnaît les composantes shapefile et ignore le reste", () => {
    expect(isShapefilePart("RO123_2025_0.shp")).toBe(true);
    expect(isShapefilePart("RO123_2025_0.DBF")).toBe(true);
    expect(isShapefilePart("RO123_2025_0.prj")).toBe(true);
    expect(isShapefilePart("notes.txt")).toBe(false);
    expect(isShapefilePart("readme.pdf")).toBe(false);
  });
});

describe("buildShapefileZipBufferFromFiles", () => {
  it("reconstruit un ZIP depuis un dossier plat en filtrant les fichiers non shapefile", async () => {
    const files = [
      fakeFile("export/RO123_2025_0.shp"),
      fakeFile("export/RO123_2025_0.dbf"),
      fakeFile("export/RO123_2025_0.shx"),
      fakeFile("export/RO123_2025_0.prj"),
      fakeFile("export/lisezmoi.txt"),
    ];
    const buffer = await buildShapefileZipBufferFromFiles(files);
    expect(buffer).not.toBeNull();
    expect(await entriesOf(buffer as ArrayBuffer)).toEqual([
      "export/RO123_2025_0.dbf",
      "export/RO123_2025_0.prj",
      "export/RO123_2025_0.shp",
      "export/RO123_2025_0.shx",
    ]);
  });

  it("gère un dossier contenant un sous-dossier (chemins relatifs préservés)", async () => {
    const files = [
      fakeFile("export/data/RO123_2025_0.shp"),
      fakeFile("export/data/RO123_2025_0.dbf"),
      fakeFile("export/data/RO123_2025_0.shx"),
    ];
    const buffer = await buildShapefileZipBufferFromFiles(files);
    expect(await entriesOf(buffer as ArrayBuffer)).toEqual([
      "export/data/RO123_2025_0.dbf",
      "export/data/RO123_2025_0.shp",
      "export/data/RO123_2025_0.shx",
    ]);
  });

  it("renvoie directement le buffer du .zip si le dossier en contient un", async () => {
    const inner = new JSZip();
    inner.file("RO123_2025_0.shp", "shp");
    const zipBuffer = await inner.generateAsync({ type: "arraybuffer" });
    const zipAsFile = {
      name: "RO123_2025_0.zip",
      webkitRelativePath: "export/RO123_2025_0.zip",
      arrayBuffer: async () => zipBuffer,
    } as unknown as File;

    const buffer = await buildShapefileZipBufferFromFiles([zipAsFile]);
    expect(buffer).toBe(zipBuffer);
  });

  it("renvoie null si aucune composante shapefile n'est présente", async () => {
    const files = [fakeFile("export/lisezmoi.txt"), fakeFile("export/photo.png")];
    expect(await buildShapefileZipBufferFromFiles(files)).toBeNull();
  });
});
