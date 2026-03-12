import { swaggerSpec } from "../src/swagger";

const spec = swaggerSpec as Record<string, unknown>;
const paths = Object.keys((spec.paths as Record<string, unknown>) || {});
const tags = ((spec.tags as Array<{ name: string }>) || []).map((t) => t.name);

console.log("Total paths:", paths.length);
console.log("Total tags:", tags.length);
console.log("\nTags:", tags.join(", "));

console.log("\n--- Paths by tag ---");
const byTag: Record<string, string[]> = {};
const pathsObj = spec.paths as Record<string, Record<string, { tags?: string[] }>>;

for (const [p, methods] of Object.entries(pathsObj)) {
  for (const [m, s] of Object.entries(methods)) {
    for (const t of s.tags || ["untagged"]) {
      if (!byTag[t]) byTag[t] = [];
      byTag[t].push(`${m.toUpperCase()} ${p}`);
    }
  }
}

for (const [t, routes] of Object.entries(byTag).sort()) {
  console.log(`\n[${t}] (${routes.length})`);
  routes.forEach((r) => console.log(`  ${r}`));
}
