import { expect, test } from "bun:test";
import {
  existingProjectId,
  filterRepos,
  githubRepoFromRemote,
  nameFromPath,
  nameFromRepo,
  projectPictureUrl,
  reposForFilter,
  typedRepo,
} from "./addProject";

test("names come from the folder or repo", () => {
  expect(nameFromPath("/Users/mitchell/Projects/Factory")).toBe("Factory");
  expect(nameFromPath("/Users/mitchell/Projects/Factory/")).toBe("Factory");
  expect(nameFromPath("")).toBe("Project");
  expect(nameFromRepo("acme/factory")).toBe("factory");
  expect(nameFromRepo("")).toBe("Project");
});

test("typedRepo accepts owner/repo only", () => {
  expect(typedRepo("Acme/Factory")).toBe("acme/factory");
  expect(typedRepo("not a repo")).toBeNull();
  expect(typedRepo("")).toBeNull();
});

test("filterRepos matches name or description", () => {
  const repos = [
    { repo: "acme/factory", description: "personal app" },
    { repo: "acme/notes", description: "" },
  ];
  expect(filterRepos(repos, "fact").map((row) => row.repo)).toEqual(["acme/factory"]);
  expect(filterRepos(repos, "personal").map((row) => row.repo)).toEqual(["acme/factory"]);
  expect(filterRepos(repos, "").length).toBe(2);
});

test("reposForFilter keeps a typed owner/repo the list missed", () => {
  const repos = [{ repo: "acme/factory", description: "" }];
  expect(reposForFilter(repos, "other/app").map((row) => row.repo)).toEqual(["other/app"]);
  expect(reposForFilter(repos, "acme/factory").map((row) => row.repo)).toEqual(["acme/factory"]);
});

test("githubRepoFromRemote reads ssh and https remotes", () => {
  expect(githubRepoFromRemote("git@github.com:Acme/Factory.git")).toBe("acme/factory");
  expect(githubRepoFromRemote("https://github.com/Acme/Factory.git")).toBe("acme/factory");
  expect(githubRepoFromRemote("https://github.com/Acme/Factory")).toBe("acme/factory");
  expect(githubRepoFromRemote("git@gitlab.com:acme/factory.git")).toBeNull();
});

test("projectPictureUrl uses the GitHub owner avatar", () => {
  expect(projectPictureUrl("vercel/next.js")).toBe("https://github.com/vercel.png?size=80");
  expect(projectPictureUrl("")).toBeNull();
});

test("existingProjectId matches repo or path", () => {
  const projects = [
    { _id: "p1", localPath: "/Users/me/Factory", githubRepo: "" },
    { _id: "p2", localPath: "", githubRepo: "acme/factory" },
  ];
  expect(existingProjectId(projects, { githubRepo: "Acme/Factory" })).toBe("p2");
  expect(existingProjectId(projects, { localPath: "/Users/me/Factory/" })).toBe("p1");
  expect(existingProjectId(projects, { localPath: "/tmp/nope" })).toBeNull();
});
