// packages/core/src/utils/StandardSchema.ts
function standardValidate(schema, input) {
  let result = schema["~standard"].validate(input);
  if (result instanceof Promise) {
    throw new Error("Schema validation must be synchronous");
  }
  if (result.issues) {
    throw new Error(JSON.stringify(result.issues, null, 2));
  }
  return result.value;
}
export {
  standardValidate
};
