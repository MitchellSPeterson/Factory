/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as jobs from "../jobs.js";
import type * as lib_agentModel from "../lib/agentModel.js";
import type * as lib_docs from "../lib/docs.js";
import type * as lib_jobState from "../lib/jobState.js";
import type * as lib_recipeGraph from "../lib/recipeGraph.js";
import type * as lib_validators from "../lib/validators.js";
import type * as projects from "../projects.js";
import type * as recipes from "../recipes.js";
import type * as seed from "../seed.js";
import type * as skills from "../skills.js";
import type * as worker from "../worker.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  jobs: typeof jobs;
  "lib/agentModel": typeof lib_agentModel;
  "lib/docs": typeof lib_docs;
  "lib/jobState": typeof lib_jobState;
  "lib/recipeGraph": typeof lib_recipeGraph;
  "lib/validators": typeof lib_validators;
  projects: typeof projects;
  recipes: typeof recipes;
  seed: typeof seed;
  skills: typeof skills;
  worker: typeof worker;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
