# Factory

A personal control plane for running Cursor agents across your product repos. You sit here. Agents do the work.

## Language

**Project**:
A single git repository you develop, including a monorepo that contains Expo and web together.
_Avoid_: App, workspace, product

**Recipe**:
An ordered list of Stages used to take a Job from request to a pull request.
_Avoid_: Pipeline, workflow, playbook, template

**Stage**:
A named phase of a Recipe. v1 keys are plan, implement, verify, and pr.
_Avoid_: Step, phase, task

**Skill**:
Factory-owned markdown whose body is what the agent sees for a Stage.
_Avoid_: Prompt, instruction, rule, cursor skill

**Binding**:
The assignment of one Skill to one Stage, with an optional Gate.
_Avoid_: Attachment, hook, plugin

**Gate**:
A named condition that decides whether a Binding is included. v1 has one name: largeAndThinSpec.
_Avoid_: Rule, predicate, filter, expression

**Job**:
One request against one Project, executed through one Recipe.
_Avoid_: Ticket, task, issue, work item

**Lane**:
The Job's place on the board. The seven lanes are Queued, Needs Grilling, Planning, Plan Review, Building, Code Review, and PR.
_Avoid_: Column, status, swimlane

**Run**:
One agent execution of one Stage of a Job.
_Avoid_: Session, attempt, launch

**Ask**:
A pending human-in-the-loop round on a Run. The agent asked. You answer in the Factory.
_Avoid_: Prompt, question set, interview, HITL

**Artifact**:
A durable output of a Stage. v1 kinds are plan_verdict, spec, and pr_url.
_Avoid_: Output, result, document

**Plan verdict**:
The structured Artifact that records whether the request is large or small and whether the spec is thin or enough.
_Avoid_: Assessment, triage, score
