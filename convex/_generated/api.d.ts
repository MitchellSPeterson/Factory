/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as github from "../github.js";
import type * as jobs from "../jobs.js";
import type * as lib_agentModel from "../lib/agentModel.js";
import type * as lib_docs from "../lib/docs.js";
import type * as lib_jobControl from "../lib/jobControl.js";
import type * as lib_jobState from "../lib/jobState.js";
import type * as lib_recipeGraph from "../lib/recipeGraph.js";
import type * as lib_runTiming from "../lib/runTiming.js";
import type * as lib_servers from "../lib/servers.js";
import type * as lib_tokenUsage from "../lib/tokenUsage.js";
import type * as lib_validators from "../lib/validators.js";
import type * as projects from "../projects.js";
import type * as recipes from "../recipes.js";
import type * as seed from "../seed.js";
import type * as servers from "../servers.js";
import type * as skills from "../skills.js";
import type * as worker from "../worker.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  github: typeof github;
  jobs: typeof jobs;
  "lib/agentModel": typeof lib_agentModel;
  "lib/docs": typeof lib_docs;
  "lib/jobControl": typeof lib_jobControl;
  "lib/jobState": typeof lib_jobState;
  "lib/recipeGraph": typeof lib_recipeGraph;
  "lib/runTiming": typeof lib_runTiming;
  "lib/servers": typeof lib_servers;
  "lib/tokenUsage": typeof lib_tokenUsage;
  "lib/validators": typeof lib_validators;
  projects: typeof projects;
  recipes: typeof recipes;
  seed: typeof seed;
  servers: typeof servers;
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
