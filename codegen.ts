
import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  overwrite: true,
  schema: "https://api.morpho.org/graphql",
  documents: "lib/morpho/queries.ts",
  generates: {
    "lib/morpho/graphql-types.ts": {
      plugins: ["typescript", "typescript-operations"],
      config: {
        scalars: {
          BigInt: "string", // Morpho API returns BigInts as strings
        },
        avoidOptionals: true, // Prefer undefined over optional fields for stricter typing
      },
    },
  },
};

export default config;
