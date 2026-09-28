import { defineFunction } from "@aws-amplify/backend";

export const adminUsers = defineFunction({
  name: "admin-users",
  entry: "./handler.ts",
});
