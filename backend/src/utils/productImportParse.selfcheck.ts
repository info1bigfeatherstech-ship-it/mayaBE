import {
  groupImportFamilies,
  matchImageFolder,
  matrixToSheetRows,
  parseAttributes,
  parseCsv,
  parseParentVariantCode,
} from "./productImportParse";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runProductImportParseChecks() {
  const parsed = parseParentVariantCode("tst-901-1");
  assert(parsed.family === "TST-901" && parsed.serial === 1 && parsed.code === "TST-901-1", "parent code");

  const extra = parseParentVariantCode("MG-001-2");
  assert(extra.family === "MG-001" && extra.serial === 2, "extra code");

  const attrs = parseAttributes('Color=Red; Size=XS, SM, L');
  assert(attrs.pairs.length === 1 && attrs.pairs[0].value === "Red", "color pair");
  assert(attrs.spreading?.key === "Size" && attrs.spreading.values.join("|") === "XS|SM|L", "size spread");

  const quoted = parseAttributes('Fabric="Cotton, Organic"; Color=Navy');
  assert(quoted.pairs.length === 2 && quoted.pairs[0].value === "Cotton, Organic", "quoted comma");
  assert(!quoted.spreading, "quoted is not spreading");

  let dualSpread = "";
  try {
    parseAttributes("Color=Red, Black; Size=S, M");
  } catch (error) {
    dualSpread = error instanceof Error ? error.message : "";
  }
  assert(dualSpread.includes("Only one attribute"), "dual spreading rejected");

  const csv = parseCsv('productCode,name\n"TST-901-1","Hoodie, Red"\nTST-901-2,\n');
  const rows = matrixToSheetRows(csv);
  assert(rows.length === 2 && rows[0].cells.name === "Hoodie, Red", "csv quoted comma");

  const grouped = groupImportFamilies(rows);
  assert(grouped.families.length === 1 && grouped.families[0].members.length === 2, "family group");
  assert(grouped.families[0].family === "TST-901", "family name");

  const gap = groupImportFamilies(
    matrixToSheetRows(parseCsv("productCode,name\nTST-901-1,A\nTST-901-3,B\n"))
  );
  assert(gap.failed.some((item) => item.reason.includes("missing TST-901-2")), "gap detected");

  const parents = new Set(["TST-901-1", "TST-901-2"]);
  assert(matchImageFolder("TST-901-1", parents)?.parentCode === "TST-901-1", "parent folder");
  assert(matchImageFolder("tst-901-1-3", parents)?.subSerial === 3, "sub folder");
  assert(matchImageFolder("TST-901-12", parents) == null, "no false sub match");

  return "ok";
}

if (require.main === module) {
  process.stdout.write(`${runProductImportParseChecks()}\n`);
}
