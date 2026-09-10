import { describe, expect, test } from "bun:test";
import {
  formatJobActivity,
  formatPlanVerdictLabel,
  hideArtifactInStage,
  jobNeed,
  jobNeedHeading,
} from "./jobNeed";

describe("jobNeed", () => {
  test("pending Ask beats the Lane", () => {
    expect(jobNeed({ status: "planReview", hasPendingAsk: true })).toBe("ask");
    expect(jobNeed({ status: "needsDetail", hasPendingAsk: true })).toBe("ask");
  });

  test("maps review and failed Lanes", () => {
    expect(jobNeed({ status: "planReview", hasPendingAsk: false })).toBe("planReview");
    expect(jobNeed({ status: "codeReview", hasPendingAsk: false })).toBe("codeReview");
    expect(jobNeed({ status: "failed", hasPendingAsk: false })).toBe("failed");
    expect(jobNeed({ status: "building", hasPendingAsk: false })).toBe("none");
    expect(jobNeed({ status: "planning", hasPendingAsk: false })).toBe("none");
  });
});

describe("jobNeedHeading", () => {
  test("uses Factory language", () => {
    expect(jobNeedHeading("ask")).toBe("Needs Grilling");
    expect(jobNeedHeading("planReview")).toBe("Plan Review");
    expect(jobNeedHeading("codeReview")).toBe("Code Review");
    expect(jobNeedHeading("failed")).toBe("This Job failed");
    expect(jobNeedHeading("none")).toBe("");
  });
});

describe("formatPlanVerdictLabel", () => {
  test("turns JSON into a readable line", () => {
    expect(formatPlanVerdictLabel(JSON.stringify({ size: "small", specQuality: "enough" }))).toBe(
      "Small · spec is enough",
    );
    expect(formatPlanVerdictLabel(JSON.stringify({ size: "large", specQuality: "thin" }))).toBe(
      "Large · spec is thin",
    );
    expect(formatPlanVerdictLabel("not json")).toBeNull();
  });
});

describe("formatJobActivity", () => {
  test("uses operator language", () => {
    expect(formatJobActivity("waitingOnHuman")).toBe("Waiting on you");
    expect(formatJobActivity("working")).toBe("Working");
    expect(formatJobActivity("done")).toBe("Done");
  });
});

describe("hideArtifactInStage", () => {
  test("keeps spec out of the Stage when Plan Review owns it", () => {
    expect(hideArtifactInStage("spec", "planReview")).toBe(true);
    expect(hideArtifactInStage("plan_verdict", "planReview")).toBe(true);
    expect(hideArtifactInStage("pr_url", "planReview")).toBe(false);
    expect(hideArtifactInStage("spec", "none")).toBe(false);
  });
});
